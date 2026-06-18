import { describe, it, expect } from 'vitest'
import { fitDixonColes, lambdasFor, type RawMatch } from '../fit'
import { scoreMatrix, outcomeProbs, overUnder, mostLikelyScore } from '../dixon-coles'
import results from '../../../data/results.json'

function loadMatches(): RawMatch[] {
  return (results.matches as unknown[][]).map((row) => ({
    date: row[0] as string,
    home: row[1] as string,
    away: row[2] as string,
    homeScore: row[3] as number,
    awayScore: row[4] as number,
    neutral: row[5] as number,
    importance: row[6] as number,
  }))
}

describe('fit on the real international dataset', () => {
  const model = fitDixonColes(loadMatches(), { asOf: '2026-06-16' })

  it('DEBUG global params and ratings', () => {
    const get = (t: string) => {
      const i = model.index.get(t)
      return i === undefined ? null : { atk: model.atk[i].toFixed(3), def: model.def[i].toFixed(3), w: model.weightPerTeam[i].toFixed(1) }
    }
    // eslint-disable-next-line no-console
    console.log('c=', model.c.toFixed(3), 'exp(c)=', Math.exp(model.c).toFixed(3), 'gamma=', model.gamma.toFixed(3), 'iters=', model.iterations)
    // eslint-disable-next-line no-console
    console.log('Uruguay', get('Uruguay'), 'Saudi Arabia', get('Saudi Arabia'), 'Brazil', get('Brazil'))
    expect(true).toBe(true)
  })

  it('ranks elite nations near the top by overall rating', () => {
    const rated = model.teams
      .map((t, i) => ({ t, rating: model.atk[i] + model.def[i], w: model.weightPerTeam[i] }))
      .filter((r) => r.w > 2) // ignore teams with almost no recent games
      .sort((a, b) => b.rating - a.rating)
    const top15 = rated.slice(0, 15).map((r) => r.t)
    // eslint-disable-next-line no-console
    console.log('Top 15 by rating:', top15.join(', '))

    const elite = ['Spain', 'France', 'Argentina', 'Brazil', 'Germany', 'England', 'Portugal']
    const hits = elite.filter((t) => top15.includes(t))
    expect(hits.length).toBeGreaterThanOrEqual(4)
  })

  it('reproduces the screenshot matchup: Saudi Arabia vs Uruguay (neutral)', () => {
    const l = lambdasFor(model, 'Saudi Arabia', 'Uruguay', false)
    expect(l).not.toBeNull()
    const { lh, la } = l!
    // eslint-disable-next-line no-console
    console.log(`Saudi xG=${lh.toFixed(2)}  Uruguay xG=${la.toFixed(2)}  rho=${model.rho.toFixed(3)}`)

    const sm = scoreMatrix(lh, la, model.rho)
    const x = outcomeProbs(sm)
    const ou = overUnder(sm, 2.5)
    const best = mostLikelyScore(sm)
    // eslint-disable-next-line no-console
    console.log(
      `1X2  Saudi ${(x.home * 100).toFixed(0)}% / Draw ${(x.draw * 100).toFixed(0)}% / Uruguay ${(x.away * 100).toFixed(0)}%  |  Under2.5 ${(ou.under * 100).toFixed(0)}%  |  most likely ${best.home}-${best.away}`,
    )

    expect(la).toBeGreaterThan(lh) // Uruguay the stronger side
    expect(x.away).toBeGreaterThan(x.home)
    expect(ou.under).toBeGreaterThan(0.5)
  })
})

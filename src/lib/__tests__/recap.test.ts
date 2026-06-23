import { describe, it, expect } from 'vitest'
import { buildRecap, devig1x2, loadPlayedResults, outcomeOf, type PlayedMatch } from '../recap'
import { getPreTournamentModel, loadHistoricalMatches, TOURNAMENT_START } from '../bestbets'
import type { FittedModel } from '../model/fit'

// A tiny, hand-built model: team A much stronger than B, high goal level.
const toyModel: FittedModel = {
  teams: ['A', 'B'],
  index: new Map([
    ['A', 0],
    ['B', 1],
  ]),
  atk: [0.5, -0.5],
  def: [0.5, -0.5],
  c: Math.log(1.3),
  gamma: 0.2,
  rho: 0,
  weightPerTeam: [50, 50],
  asOf: '2026-01-01',
  halfLifeYears: 2,
  iterations: 1,
  logLik: 0,
}

describe('outcomeOf', () => {
  it('classifies the match result from the score', () => {
    expect(outcomeOf(2, 0)).toBe('home')
    expect(outcomeOf(1, 1)).toBe('draw')
    expect(outcomeOf(0, 3)).toBe('away')
  })
})

describe('buildRecap scoring is internally consistent', () => {
  const matches: PlayedMatch[] = [
    { date: '2026-06-15', home: 'A', away: 'B', homeScore: 2, awayScore: 0, neutral: 1 },
  ]
  const recap = buildRecap(toyModel, matches)
  const r = recap.rows[0]

  it('scores the one known match', () => {
    expect(recap.summary.n).toBe(1)
    expect(recap.skipped).toHaveLength(0)
  })

  it('1X2 probabilities sum to 1', () => {
    expect(r.probs.home + r.probs.draw + r.probs.away).toBeCloseTo(1, 6)
  })

  it('favours the stronger side and calls this home win correctly', () => {
    expect(r.probs.home).toBeGreaterThan(r.probs.away)
    expect(r.modelPick).toBe('home')
    expect(r.actual).toBe('home')
    expect(r.outcomeHit).toBe(true)
  })

  it('log-loss is −ln(prob the model gave the actual outcome)', () => {
    expect(r.logLoss).toBeCloseTo(-Math.log(r.probs.home), 9)
  })

  it('Brier is the squared error against the one-hot actual outcome', () => {
    const expected =
      (r.probs.home - 1) ** 2 + (r.probs.draw - 0) ** 2 + (r.probs.away - 0) ** 2
    expect(r.brier).toBeCloseTo(expected, 9)
    expect(r.brier).toBeGreaterThanOrEqual(0)
    expect(r.brier).toBeLessThanOrEqual(2)
  })

  it('settles BTTS from the actual score (B failed to score → No, model leaned No)', () => {
    // 2-0: both teams did NOT score, so the actual is BTTS-No.
    const modelLeanedYes = r.pBttsYes >= 0.5
    expect(r.bttsHit).toBe(modelLeanedYes === false)
  })
})

describe('skips matches with a team the model has never seen', () => {
  const recap = buildRecap(toyModel, [
    { date: '2026-06-15', home: 'A', away: 'Atlantis', homeScore: 1, awayScore: 0, neutral: 1 },
  ])
  it('drops them into skipped rather than guessing', () => {
    expect(recap.rows).toHaveLength(0)
    expect(recap.skipped).toHaveLength(1)
    expect(recap.skipped[0].away).toBe('Atlantis')
  })
})

describe('played dataset', () => {
  const played = loadPlayedResults()

  it('holds the matchday-1 and matchday-2 results through 2026-06-22', () => {
    expect(played).toHaveLength(43)
    for (const m of played) {
      expect(m.date >= '2026-06-11' && m.date <= '2026-06-22').toBe(true)
      expect(Number.isInteger(m.homeScore)).toBe(true)
      expect(Number.isInteger(m.awayScore)).toBe(true)
      expect(m.neutral === 0 || m.neutral === 1).toBe(true)
    }
  })
})

describe('the recap is a true held-out test', () => {
  it('the pre-tournament model is fit only on games before kick-off (no leakage)', () => {
    const model = getPreTournamentModel()
    expect(model.asOf < TOURNAMENT_START).toBe(true)
    // None of the scored matchups may appear in that model's training window.
    const trainKeys = new Set(
      loadHistoricalMatches()
        .filter((m) => m.date < TOURNAMENT_START)
        .map((m) => `${m.date}|${m.home}|${m.away}`),
    )
    for (const p of loadPlayedResults()) {
      expect(trainKeys.has(`${p.date}|${p.home}|${p.away}`)).toBe(false)
    }
  })
})

describe('recap on the real model + real results', () => {
  const recap = buildRecap(getPreTournamentModel(), loadPlayedResults())

  it('recognises every team (the matchups come from the same source as the model)', () => {
    expect(recap.summary.n + recap.skipped.length).toBe(43)
    // All 2026 sides exist in the historical international dataset.
    expect(recap.skipped).toHaveLength(0)
  })

  it('produces finite, in-range summary metrics', () => {
    const s = recap.summary
    expect(s.outcomeHitRate).toBeGreaterThanOrEqual(0)
    expect(s.outcomeHitRate).toBeLessThanOrEqual(1)
    expect(Number.isFinite(s.meanBrier)).toBe(true)
    expect(s.meanBrier).toBeGreaterThanOrEqual(0)
    expect(s.meanBrier).toBeLessThanOrEqual(2)
    expect(Number.isFinite(s.meanLogLoss)).toBe(true)
    expect(s.uniformBrier).toBeCloseTo(2 / 3, 9)
  })

  it('benchmarks the model against the de-vigged book on the priced subset', () => {
    expect(recap.market).not.toBeNull()
    // 10 of the 28 played games carry odds (see played.json).
    expect(recap.market!.n).toBe(10)
    expect(Number.isFinite(recap.market!.brierSkillScore)).toBe(true)
    expect(recap.market!.modelSharperCount).toBeGreaterThanOrEqual(0)
    expect(recap.market!.modelSharperCount).toBeLessThanOrEqual(10)
  })
})

describe('devig1x2', () => {
  it('normalises implied probabilities to sum to 1', () => {
    const p = devig1x2({ home: 1.5, draw: 4.0, away: 7.0 })
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 9)
    expect(p.home).toBeGreaterThan(p.draw)
    expect(p.draw).toBeGreaterThan(p.away)
  })

  it('leaves a margin-free book unchanged', () => {
    const p = devig1x2({ home: 2, draw: 4, away: 4 })
    expect(p.home).toBeCloseTo(0.5, 9)
    expect(p.draw).toBeCloseTo(0.25, 9)
    expect(p.away).toBeCloseTo(0.25, 9)
  })
})

describe('market comparison', () => {
  it('scores model vs book when a match carries odds', () => {
    const recap = buildRecap(toyModel, [
      { date: '2026-06-15', home: 'A', away: 'B', homeScore: 2, awayScore: 0, neutral: 1, odds: { home: 1.5, draw: 4.0, away: 7.0 } },
    ])
    const row = recap.rows[0]
    expect(row.market).toBeDefined()
    expect(row.market!.probs.home + row.market!.probs.draw + row.market!.probs.away).toBeCloseTo(1, 9)
    // The toy model is far more confident in the (correct) home win than the book.
    expect(recap.market).not.toBeNull()
    expect(recap.market!.n).toBe(1)
    expect(recap.market!.modelBrier).toBeLessThan(recap.market!.marketBrier)
    expect(recap.market!.brierSkillScore).toBeGreaterThan(0)
    expect(recap.market!.modelSharperCount).toBe(1)
  })

  it('is null when no match carries odds', () => {
    const recap = buildRecap(toyModel, [
      { date: '2026-06-15', home: 'A', away: 'B', homeScore: 1, awayScore: 0, neutral: 1 },
    ])
    expect(recap.market).toBeNull()
  })
})

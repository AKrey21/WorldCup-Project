import { describe, it, expect } from 'vitest'
import {
  scoreMatrix,
  outcomeProbs,
  overUnder,
  bttsProbs,
  mostLikelyScore,
  totalGoalsDistribution,
  tau,
} from '../dixon-coles'
import { poissonPmf } from '../poisson'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('dixon-coles engine', () => {
  it('produces a valid pmf that sums to 1', () => {
    const sm = scoreMatrix(1.5, 1.1, -0.03)
    const total = sum(sm.m.flat())
    expect(total).toBeCloseTo(1, 6)
  })

  it('reduces to independent Poisson when rho = 0', () => {
    const lh = 1.4
    const la = 0.9
    const sm = scoreMatrix(lh, la, 0)
    // Cell (3,2) is outside the tau-corrected low-score block, so it should be
    // the raw product (up to the renormalisation factor, which is ~1 here).
    expect(sm.m[3][2]).toBeCloseTo(poissonPmf(3, lh) * poissonPmf(2, la), 4)
    expect(tau(3, 2, lh, la, 0)).toBe(1)
  })

  it('tau lifts/depresses exactly the four low-score cells', () => {
    const lh = 1.2
    const la = 0.8
    const rho = -0.05
    expect(tau(0, 0, lh, la, rho)).toBeCloseTo(1 - lh * la * rho, 12)
    expect(tau(1, 1, lh, la, rho)).toBeCloseTo(1 - rho, 12)
    expect(tau(0, 1, lh, la, rho)).toBeCloseTo(1 + lh * rho, 12)
    expect(tau(1, 0, lh, la, rho)).toBeCloseTo(1 + la * rho, 12)
    expect(tau(2, 1, lh, la, rho)).toBe(1)
  })

  it('all derived markets are coherent probability splits', () => {
    const sm = scoreMatrix(1.7, 1.0, -0.04)
    const x = outcomeProbs(sm)
    expect(x.home + x.draw + x.away).toBeCloseTo(1, 6)
    expect(x.home).toBeGreaterThan(x.away) // stronger home lambda

    const ou = overUnder(sm, 2.5)
    expect(ou.over + ou.under).toBeCloseTo(1, 6)

    const btts = bttsProbs(sm)
    expect(btts.yes + btts.no).toBeCloseTo(1, 6)

    expect(sum(totalGoalsDistribution(sm))).toBeCloseTo(1, 6)
  })

  it('finds the cell with maximum mass as the most likely score', () => {
    const sm = scoreMatrix(0.5, 1.4, -0.03)
    const best = mostLikelyScore(sm)
    let max = -1
    for (let i = 0; i <= sm.maxGoals; i++)
      for (let j = 0; j <= sm.maxGoals; j++) max = Math.max(max, sm.m[i][j])
    expect(best.prob).toBeCloseTo(max, 12)
    expect(best.away).toBeGreaterThanOrEqual(best.home) // away is the heavy side
  })

  it('reproduces the screenshot shape for Saudi 0.46 vs Uruguay 1.29', () => {
    // Home = Saudi Arabia (0.46), Away = Uruguay (1.29), from the model snapshot.
    const sm = scoreMatrix(0.46, 1.29, -0.03)
    const x = outcomeProbs(sm)
    const ou = overUnder(sm, 2.5)
    const best = mostLikelyScore(sm)

    expect(x.away).toBeGreaterThan(x.home) // Uruguay favoured
    expect(x.home).toBeLessThan(0.2) // Saudi a clear underdog (~12%)
    expect(ou.under).toBeGreaterThan(0.65) // strongly Under 2.5 (~74%)
    expect(best.home).toBe(0)
    expect(best.away).toBe(1) // most likely score 0-1
  })
})

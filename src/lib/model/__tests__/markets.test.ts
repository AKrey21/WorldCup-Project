import { describe, it, expect } from 'vitest'
import {
  scoreMatrix,
  oddEvenProbs,
  handicapProbs,
  overUnder,
  asianHandicap,
  asianHandicapEv,
} from '../dixon-coles'

describe('oddEvenProbs', () => {
  it('partitions the total-goals mass into odd and even', () => {
    const sm = scoreMatrix(1.4, 1.1, -0.05)
    const { odd, even } = oddEvenProbs(sm)
    expect(odd + even).toBeCloseTo(1, 10)
    expect(odd).toBeGreaterThan(0)
    expect(even).toBeGreaterThan(0)
  })

  it('0-0 (even) carries real mass in a low-scoring game', () => {
    const sm = scoreMatrix(0.6, 0.5, 0)
    const { even } = oddEvenProbs(sm)
    expect(even).toBeGreaterThan(0.4)
  })
})

describe('handicapProbs', () => {
  it('home and away cover probabilities sum to 1 (no push on .5 lines)', () => {
    const sm = scoreMatrix(1.8, 0.9, -0.03)
    const h = handicapProbs(sm, -1.5)
    expect(h.home + h.away).toBeCloseTo(1, 10)
  })

  it('a more favourable line raises the home cover probability', () => {
    const sm = scoreMatrix(1.5, 1.2, 0)
    expect(handicapProbs(sm, 1.5).home).toBeGreaterThan(handicapProbs(sm, -1.5).home)
  })

  it('home −1.5 equals the chance the home team wins by 2+ goals', () => {
    const sm = scoreMatrix(2.0, 0.5, 0)
    // P(home margin >= 2) computed directly from the matrix.
    let byTwoPlus = 0
    for (let i = 0; i <= sm.maxGoals; i++)
      for (let j = 0; j <= sm.maxGoals; j++) if (i - j >= 2) byTwoPlus += sm.m[i][j]
    expect(handicapProbs(sm, -1.5).home).toBeCloseTo(byTwoPlus, 10)
  })

  it('home +1.5 (= away −1.5 complement) is much likelier than home −1.5 for a strong home side', () => {
    const sm = scoreMatrix(2.0, 0.5, 0)
    expect(handicapProbs(sm, 1.5).home).toBeGreaterThan(handicapProbs(sm, -1.5).home)
    // Over 2.5 and the handicap markets are independent reads of the same matrix.
    expect(overUnder(sm, 2.5).over + overUnder(sm, 2.5).under).toBeCloseTo(1, 10)
  })
})

describe('asianHandicap', () => {
  const sm = scoreMatrix(1.8, 0.9, -0.03)

  it('a half line has no push/half settlements and matches the simple handicap', () => {
    const ah = asianHandicap(sm, -1.5)
    const simple = handicapProbs(sm, -1.5)
    expect(ah.home.push).toBe(0)
    expect(ah.home.halfWin).toBe(0)
    expect(ah.home.halfLoss).toBe(0)
    expect(ah.home.prob).toBeCloseTo(simple.home, 10)
    expect(ah.home.fairOdds).toBeCloseTo(1 / simple.home, 8)
  })

  it('the level line (0) can push, shortening fair odds below 1/cover', () => {
    const ah = asianHandicap(sm, 0)
    expect(ah.home.push).toBeGreaterThan(0)
    // A push refunds stake, so EV-neutral odds sit below the pure-win 1/cover.
    expect(ah.home.fairOdds).toBeLessThan(1 / ah.home.prob)
  })

  it('a quarter line splits into half-win/half-loss with no full push', () => {
    const ah = asianHandicap(sm, -0.75)
    expect(ah.home.push).toBe(0)
    expect(ah.home.halfWin + ah.home.halfLoss).toBeGreaterThan(0)
    const total =
      ah.home.win + ah.home.halfWin + ah.home.push + ah.home.halfLoss + ah.home.loss
    expect(total).toBeCloseTo(1, 10)
  })

  it('home and away are exact mirrors', () => {
    const ah = asianHandicap(sm, -0.5)
    expect(ah.home.win).toBeCloseTo(ah.away.loss, 12)
    expect(ah.home.loss).toBeCloseTo(ah.away.win, 12)
    expect(ah.home.push).toBeCloseTo(ah.away.push, 12)
  })

  it('fair odds give zero EV on every line type', () => {
    for (const line of [-1.5, -1, -0.75, -0.5, -0.25, 0]) {
      const ah = asianHandicap(sm, line)
      expect(asianHandicapEv(ah.home, ah.home.fairOdds)).toBeCloseTo(0, 9)
      expect(asianHandicapEv(ah.away, ah.away.fairOdds)).toBeCloseTo(0, 9)
    }
  })
})

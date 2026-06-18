import { describe, it, expect } from 'vitest'
import {
  confidence1x2,
  confidenceBinary,
  hitRatesByTier,
  reliabilityCurve,
} from '../confidence'

describe('confidence1x2', () => {
  it('a 45/45/10 split is a tossup — healthy top prob but no clear favourite', () => {
    const c = confidence1x2({ home: 0.45, draw: 0.45, away: 0.1 })
    expect(c.tier).toBe('tossup')
    expect(c.gap).toBeCloseTo(0, 6)
    expect(c.top).toBeCloseTo(0.45, 6)
    expect(c.label).toBe('Tossup')
  })

  it('a 70/19/11 split is a clear favourite', () => {
    expect(confidence1x2({ home: 0.7, draw: 0.19, away: 0.11 }).tier).toBe('clear')
  })

  it('a 48/28/24 split is a lean (favourite under 55%, gap over 10pts)', () => {
    expect(confidence1x2({ home: 0.48, draw: 0.28, away: 0.24 }).tier).toBe('lean')
  })

  it('a 34/33/33 three-way is a tossup', () => {
    expect(confidence1x2({ home: 0.34, draw: 0.33, away: 0.33 }).tier).toBe('tossup')
  })

  it('is order-independent — the favourite can be any outcome', () => {
    expect(confidence1x2({ home: 0.11, draw: 0.19, away: 0.7 }).tier).toBe('clear')
  })
})

describe('confidenceBinary (Over/Under, BTTS)', () => {
  it('a 50/50 is a tossup', () => {
    const c = confidenceBinary(0.5)
    expect(c.tier).toBe('tossup')
    expect(c.top).toBeCloseTo(0.5, 6)
    expect(c.gap).toBeCloseTo(0, 6)
  })

  it('a 55/45 still reads as a tossup (binary needs its own threshold)', () => {
    expect(confidenceBinary(0.55).tier).toBe('tossup')
  })

  it('a 62/38 is a lean', () => {
    expect(confidenceBinary(0.62).tier).toBe('lean')
  })

  it('a 75/25 is a clear read', () => {
    expect(confidenceBinary(0.75).tier).toBe('clear')
  })

  it('uses the favoured side — works when the under/no side is favoured', () => {
    const c = confidenceBinary(0.25) // 25% over → 75% under
    expect(c.tier).toBe('clear')
    expect(c.top).toBeCloseTo(0.75, 6)
  })
})

describe('hitRatesByTier', () => {
  it('buckets outcomes and computes per-tier hit rate + implied (meanTop)', () => {
    const items = [
      { c: confidence1x2({ home: 0.7, draw: 0.2, away: 0.1 }), hit: true }, // clear, hit
      { c: confidence1x2({ home: 0.6, draw: 0.25, away: 0.15 }), hit: false }, // clear, miss
      { c: confidence1x2({ home: 0.45, draw: 0.45, away: 0.1 }), hit: false }, // tossup
    ]
    const stats = hitRatesByTier(items)
    expect(stats.map((s) => s.tier)).toEqual(['clear', 'lean', 'tossup'])

    const clear = stats.find((s) => s.tier === 'clear')!
    expect(clear.n).toBe(2)
    expect(clear.hits).toBe(1)
    expect(clear.hitRate).toBeCloseTo(0.5, 6)
    expect(clear.meanTop).toBeCloseTo(0.65, 6)

    expect(stats.find((s) => s.tier === 'tossup')!.n).toBe(1)
  })

  it('returns all three tiers even when empty', () => {
    const stats = hitRatesByTier([])
    expect(stats).toHaveLength(3)
    expect(stats.every((s) => s.n === 0 && s.hitRate === 0 && s.meanTop === 0)).toBe(true)
  })
})

describe('reliabilityCurve', () => {
  it('buckets forecasts and compares predicted vs observed per bin', () => {
    const items = [
      { p: 0.1, hit: false }, // 0–20 bin
      { p: 0.15, hit: false }, // 0–20 bin
      { p: 0.9, hit: true }, // 80–100 bin
      { p: 0.85, hit: true }, // 80–100 bin
    ]
    const bins = reliabilityCurve(items)
    expect(bins).toHaveLength(5)

    const low = bins[0]
    expect(low.n).toBe(2)
    expect(low.predicted).toBeCloseTo(0.125, 6)
    expect(low.observed).toBeCloseTo(0, 6)

    const high = bins[4]
    expect(high.n).toBe(2)
    expect(high.predicted).toBeCloseTo(0.875, 6)
    expect(high.observed).toBeCloseTo(1, 6)
  })

  it('a perfectly calibrated set sits on the diagonal', () => {
    // 10 forecasts at 0.6, exactly 6 hits → observed 60% in the 60–80 bin.
    const items = Array.from({ length: 10 }, (_, i) => ({ p: 0.6, hit: i < 6 }))
    const bin = reliabilityCurve(items).find((b) => b.lo === 0.6)!
    expect(bin.predicted).toBeCloseTo(0.6, 6)
    expect(bin.observed).toBeCloseTo(0.6, 6)
  })
})

import { describe, it, expect } from 'vitest'
import { clvOf, clvSummary } from '../clv'
import type { Pick } from '../../types'

function pick(oddsDecimal: number, closingOdds?: number): Pick {
  return {
    id: `p-${oddsDecimal}-${closingOdds ?? 'x'}`,
    matchId: 'm',
    market: '1X2',
    selection: 'Home',
    oddsDecimal,
    stake: 10,
    result: 'pending',
    capturedAt: '2026-06-18T00:00:00Z',
    closingOdds,
  }
}

describe('clvOf', () => {
  it('positive CLV when you took bigger odds than the close', () => {
    const c = clvOf(2.1, 2.0)!
    expect(c.beat).toBe(true)
    expect(c.pct).toBeCloseTo(0.05, 6)
  })

  it('negative CLV when you took a worse price than the close', () => {
    const c = clvOf(1.9, 2.0)!
    expect(c.beat).toBe(false)
    expect(c.pct).toBeCloseTo(-0.05, 6)
  })

  it('rejects invalid odds (≤ 1 or non-finite)', () => {
    expect(clvOf(1, 2)).toBeNull()
    expect(clvOf(2, Number.NaN)).toBeNull()
  })
})

describe('clvSummary', () => {
  it('aggregates only the picks that carry a closing price', () => {
    const s = clvSummary([
      pick(2.1, 2.0), // +5%, beat
      pick(1.8, 2.0), // −10%, missed
      pick(2.0), // no close → excluded
    ])
    expect(s.n).toBe(2)
    expect(s.beat).toBe(1)
    expect(s.beatRate).toBeCloseTo(0.5, 6)
    expect(s.avgPct).toBeCloseTo((0.05 + (1.8 / 2.0 - 1)) / 2, 6)
  })

  it('is empty when no pick has a closing price', () => {
    const s = clvSummary([pick(2.0), pick(1.5)])
    expect(s.n).toBe(0)
    expect(s.beatRate).toBe(0)
    expect(s.avgPct).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import { computeStats, equitySeries } from '../stats'
import { evFlag, expectedValue, impliedProb } from '../ev'
import type { AppState, Pick, PickResult } from '../../types'

let n = 0
function pick(result: PickResult, stake: number, odds: number, settledAt?: string): Pick {
  n += 1
  return {
    id: `p${n}`,
    matchId: 'm1',
    market: '1X2',
    selection: `Sel ${n}`,
    oddsDecimal: odds,
    stake,
    result,
    capturedAt: '2026-06-12T10:00:00.000Z',
    settledAt: result === 'pending' ? undefined : (settledAt ?? `2026-06-12T1${n}:00:00.000Z`),
  }
}

function stateWith(picks: Pick[]): AppState {
  return {
    ledger: { startingBankroll: 100, deposits: [] },
    matches: [],
    picks,
  }
}

describe('computeStats', () => {
  it('derives balance from settled picks only', () => {
    const s = computeStats(
      stateWith([pick('win', 2, 2.5), pick('loss', 2, 1.8), pick('pending', 5, 2)]),
    )
    // 100 + 2*(1.5) - 2 = 101
    expect(s.balance).toBeCloseTo(101)
    expect(s.openStake).toBe(5)
    expect(s.pendingCount).toBe(1)
    expect(s.settledCount).toBe(2)
  })

  it('computes ROI over settled turnover and excludes voids', () => {
    const s = computeStats(stateWith([pick('win', 10, 2), pick('void', 10, 2)]))
    expect(s.totalStaked).toBe(10)
    expect(s.roiPct).toBeCloseTo(100)
  })

  it('hit rate ignores pushes and voids, counts half-wins as hits', () => {
    const s = computeStats(
      stateWith([
        pick('win', 1, 2),
        pick('half-win', 1, 2),
        pick('loss', 1, 2),
        pick('push', 1, 2),
        pick('void', 1, 2),
      ]),
    )
    expect(s.hitRatePct).toBeCloseTo((2 / 3) * 100)
  })

  it('tracks streaks from the latest settled pick', () => {
    const s = computeStats(
      stateWith([pick('loss', 1, 2), pick('win', 1, 2), pick('win', 1, 2)]),
    )
    expect(s.streak).toEqual({ kind: 'W', length: 2 })
  })

  it('reports biggest win and loss', () => {
    const s = computeStats(stateWith([pick('win', 2, 3), pick('loss', 5, 2)]))
    expect(s.biggestWin).toBeCloseTo(4)
    expect(s.biggestLoss).toBeCloseTo(-5)
  })

  it('returns null rates with no settled picks', () => {
    const s = computeStats(stateWith([pick('pending', 1, 2)]))
    expect(s.roiPct).toBeNull()
    expect(s.hitRatePct).toBeNull()
    expect(s.balance).toBe(100)
  })
})

describe('equitySeries', () => {
  it('starts at the bankroll and steps through settlements in time order', () => {
    const late = pick('win', 2, 2, '2026-06-12T18:00:00.000Z')
    const early = pick('loss', 2, 2, '2026-06-12T12:00:00.000Z')
    const points = equitySeries(stateWith([late, early]))
    expect(points.map((p) => p.balance)).toEqual([100, 98, 100])
  })
})

describe('EV math', () => {
  it('EV = p·(odds−1) − (1−p)', () => {
    expect(expectedValue(0.5, 2.2)).toBeCloseTo(0.1)
    expect(expectedValue(1 / 2, 2)).toBeCloseTo(0)
  })
  it('implied probability is 1/odds', () => {
    expect(impliedProb(4)).toBe(0.25)
  })
  it('flags +EV / −EV around the implied break-even', () => {
    expect(evFlag(0.6, 2)).toBe('+EV')
    expect(evFlag(0.4, 2)).toBe('-EV')
    expect(evFlag(undefined, 2)).toBeNull()
  })
})

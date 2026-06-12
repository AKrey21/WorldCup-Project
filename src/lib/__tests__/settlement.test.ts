import { describe, expect, it } from 'vitest'
import {
  isAHMarket,
  parseHandicap,
  partsToResult,
  pickProfit,
  settleAH,
  settleSimple,
} from '../settlement'
import type { Pick } from '../../types'

describe('settleSimple', () => {
  it('wins on positive margin, pushes on zero, loses on negative', () => {
    expect(settleSimple(1)).toEqual({ win: 1, push: 0, loss: 0 })
    expect(settleSimple(0)).toEqual({ win: 0, push: 1, loss: 0 })
    expect(settleSimple(-2)).toEqual({ win: 0, push: 0, loss: 1 })
  })
})

describe('settleAH half lines (spec worked example: Portugal -1.5 / Nigeria +1.5)', () => {
  it('Portugal 3-1: -1.5 wins, +1.5 loses', () => {
    expect(partsToResult(settleAH(3, 1, -1.5))).toBe('win')
    expect(partsToResult(settleAH(1, 3, 1.5))).toBe('loss')
  })
  it('Portugal 1-0: -1.5 loses, +1.5 wins', () => {
    expect(partsToResult(settleAH(1, 0, -1.5))).toBe('loss')
    expect(partsToResult(settleAH(0, 1, 1.5))).toBe('win')
  })
  it('1-1 draw: -1.5 loses, +1.5 wins', () => {
    expect(partsToResult(settleAH(1, 1, -1.5))).toBe('loss')
    expect(partsToResult(settleAH(1, 1, 1.5))).toBe('win')
  })
  it('Nigeria win 0-1: +1.5 wins', () => {
    expect(partsToResult(settleAH(1, 0, 1.5))).toBe('win')
  })
})

describe('settleAH whole lines', () => {
  it('pushes when adjusted margin is exactly zero', () => {
    expect(partsToResult(settleAH(2, 1, -1))).toBe('push')
    expect(partsToResult(settleAH(1, 2, 1))).toBe('push')
  })
  it('settles clean otherwise', () => {
    expect(partsToResult(settleAH(3, 1, -1))).toBe('win')
    expect(partsToResult(settleAH(1, 1, -1))).toBe('loss')
  })
})

describe('settleAH quarter lines', () => {
  it('-0.25: draw is a half-loss, win by 1 is a full win', () => {
    expect(partsToResult(settleAH(1, 1, -0.25))).toBe('half-loss')
    expect(partsToResult(settleAH(2, 1, -0.25))).toBe('win')
  })
  it('-0.75: win by exactly 1 is a half-win', () => {
    expect(partsToResult(settleAH(2, 1, -0.75))).toBe('half-win')
    expect(partsToResult(settleAH(3, 1, -0.75))).toBe('win')
    expect(partsToResult(settleAH(1, 1, -0.75))).toBe('loss')
  })
  it('+0.25: draw is a half-win', () => {
    expect(partsToResult(settleAH(1, 1, 0.25))).toBe('half-win')
  })
  it('fractions always sum to 1', () => {
    const parts = settleAH(2, 1, -0.75)
    expect(parts.win + parts.push + parts.loss).toBeCloseTo(1)
  })
})

describe('pickProfit', () => {
  const base: Pick = {
    id: 'p1',
    matchId: 'm1',
    market: '1/2 Goal',
    selection: 'Portugal -1.5',
    oddsDecimal: 1.82,
    stake: 10,
    result: 'pending',
    capturedAt: new Date().toISOString(),
  }
  it('matches the spec payout table ($10 @ 1.82 wins $8.20 profit)', () => {
    expect(pickProfit({ ...base, result: 'win' })).toBeCloseTo(8.2)
  })
  it('half-win pays half the profit', () => {
    expect(pickProfit({ ...base, result: 'half-win' })).toBeCloseTo(4.1)
  })
  it('half-loss loses half the stake', () => {
    expect(pickProfit({ ...base, result: 'half-loss' })).toBeCloseTo(-5)
  })
  it('loss loses the stake; push/void/pending are flat', () => {
    expect(pickProfit({ ...base, result: 'loss' })).toBe(-10)
    expect(pickProfit({ ...base, result: 'push' })).toBe(0)
    expect(pickProfit({ ...base, result: 'void' })).toBe(0)
    expect(pickProfit({ ...base, result: 'pending' })).toBe(0)
  })
})

describe('handicap helpers', () => {
  it('parses trailing handicaps from selection labels', () => {
    expect(parseHandicap('Portugal -1.5')).toBe(-1.5)
    expect(parseHandicap('Nigeria (+0.5)')).toBe(0.5)
    expect(parseHandicap('Portugal +0.25')).toBe(0.25)
    expect(parseHandicap('Draw')).toBeNull()
  })
  it('recognises SG Pools goal-line market names', () => {
    expect(isAHMarket('1/2 Goal')).toBe(true)
    expect(isAHMarket('1 1/2 Goal')).toBe(true)
    expect(isAHMarket('Total Goals Over/Under 2.5')).toBe(false)
    expect(isAHMarket('1X2')).toBe(false)
  })
})

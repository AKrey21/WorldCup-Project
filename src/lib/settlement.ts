import type { Pick, PickResult } from '../types'

/** Fractions of stake landing in each bucket. Always sums to 1. */
export interface SettlementParts {
  win: number
  push: number
  loss: number
}

export function settleSimple(margin: number): SettlementParts {
  if (margin > 0) return { win: 1, push: 0, loss: 0 }
  if (margin === 0) return { win: 0, push: 1, loss: 0 }
  return { win: 0, push: 0, loss: 1 }
}

/**
 * Asian Handicap settlement for any line type.
 * Half lines settle clean; whole lines can push; quarter lines split the
 * stake across the two nearest half/whole lines (half-win / half-loss).
 */
export function settleAH(
  backedGoals: number,
  oppGoals: number,
  handicap: number,
): SettlementParts {
  const G = backedGoals - oppGoals
  const isQuarter = Math.abs(((handicap * 2) % 1)) > 1e-9 // .25 / .75
  if (!isQuarter) return settleSimple(G + handicap)
  const a = settleSimple(G + (handicap - 0.25))
  const b = settleSimple(G + (handicap + 0.25))
  return {
    win: (a.win + b.win) / 2,
    push: (a.push + b.push) / 2,
    loss: (a.loss + b.loss) / 2,
  }
}

/** Map settlement fractions onto the Pick result vocabulary. */
export function partsToResult(parts: SettlementParts): PickResult {
  if (parts.win === 1) return 'win'
  if (parts.loss === 1) return 'loss'
  if (parts.push === 1) return 'push'
  if (parts.win === 0.5) return 'half-win'
  if (parts.loss === 0.5) return 'half-loss'
  return 'push'
}

/** Net profit (excluding returned stake) for a pick given its result. */
export function pickProfit(pick: Pick): number {
  const { stake, oddsDecimal: odds, result } = pick
  switch (result) {
    case 'win':
      return stake * (odds - 1)
    case 'half-win':
      return (stake / 2) * (odds - 1)
    case 'half-loss':
      return -stake / 2
    case 'loss':
      return -stake
    case 'push':
    case 'void':
    case 'pending':
      return 0
  }
}

export const SETTLED_RESULTS: PickResult[] = [
  'win',
  'half-win',
  'push',
  'half-loss',
  'loss',
  'void',
]

export function isSettled(pick: Pick): boolean {
  return pick.result !== 'pending'
}

/**
 * Pull a handicap line out of a selection or market label,
 * e.g. "Portugal -1.5" or "Nigeria (+0.5)" → -1.5 / 0.5.
 */
export function parseHandicap(text: string): number | null {
  const m = text.match(/\(?\s*([+-]\d+(?:\.\d+)?)\s*\)?\s*$/)
  if (!m) return null
  const value = parseFloat(m[1])
  return Number.isFinite(value) ? value : null
}

/** SG Pools labels AH markets by goal line ("1/2 Goal"), not "Asian Handicap". */
export function isAHMarket(marketName: string): boolean {
  return /handicap|goal\b/i.test(marketName) && !/total|over\/under|odd\/even|scorer|correct/i.test(marketName)
}

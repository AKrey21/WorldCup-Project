// Closing Line Value — the one metric that predicts long-run betting skill.
//
// Did the price you took beat the market's *closing* line? If you consistently
// get bigger odds than the final price, you're picking off value before the
// market corrects — the surest sign of an edge, and it works on a far smaller
// sample than win/loss does. CLV% here is the price ratio: the extra payout your
// odds locked in over the close. Positive = you beat the close.

import type { Pick } from '../types'

export interface Clv {
  /** taken / closing − 1. Positive = you beat the closing line. */
  pct: number
  /** True if your decimal odds were larger than the close. */
  beat: boolean
}

export function clvOf(taken: number, closing: number): Clv | null {
  if (!Number.isFinite(taken) || !Number.isFinite(closing) || taken <= 1 || closing <= 1) {
    return null
  }
  return { pct: taken / closing - 1, beat: taken > closing }
}

export interface ClvSummary {
  /** Picks that carry a closing price (the sample). */
  n: number
  beat: number
  /** Fraction that beat the close. Long-run >0.5 (and positive avg) signals skill. */
  beatRate: number
  /** Mean CLV% across the priced picks. */
  avgPct: number
}

export function clvSummary(picks: Pick[]): ClvSummary {
  const vals = picks
    .map((p) => (p.closingOdds !== undefined ? clvOf(p.oddsDecimal, p.closingOdds) : null))
    .filter((x): x is Clv => x !== null)
  const n = vals.length
  const beat = vals.filter((v) => v.beat).length
  const avgPct = n ? vals.reduce((s, v) => s + v.pct, 0) / n : 0
  return { n, beat, beatRate: n ? beat / n : 0, avgPct }
}

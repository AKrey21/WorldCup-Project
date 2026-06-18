// Prediction confidence — a SEPARATE axis from betting value.
//
// How decisive is the model's read? A 45/45/10 has a healthy 45% top prob but no
// clear favourite, so it should read as a "tossup", not a pick. We tier on the
// GAP between the top outcomes, which is what actually distinguishes "one side
// clearly ahead" from "coin-flip".
//
// Crucially this says nothing about whether a bet is good: the best value is
// often ON the tossups, where the model most disagrees with a price. Keep this
// visually and conceptually distinct from the edge/EV tiers.

import type { OneXTwo } from './model/dixon-coles'

export type ConfidenceTier = 'clear' | 'lean' | 'tossup'

export interface Confidence {
  tier: ConfidenceTier
  /** Display label (market-specific). */
  label: string
  /** Favoured outcome probability (max of the options). */
  top: number
  /** Gap between the favoured outcome and the next (0..1). */
  gap: number
}

const LABEL_3WAY: Record<ConfidenceTier, string> = {
  clear: 'Clear favourite',
  lean: 'Lean',
  tossup: 'Tossup',
}
// Short, market-agnostic labels for binary markets and the calibration buckets.
const TIER_LABEL: Record<ConfidenceTier, string> = {
  clear: 'Clear',
  lean: 'Lean',
  tossup: 'Tossup',
}

/**
 * Three-way market (1X2). Tossup = the top two outcomes are within 10 points (or
 * no outcome clears 40%); clear favourite = a 55%+ side with a 15-point cushion;
 * everything between is a lean.
 */
export function confidence1x2(x: OneXTwo): Confidence {
  const sorted = [x.home, x.draw, x.away].sort((a, b) => b - a)
  const top = sorted[0]
  const gap = sorted[0] - sorted[1]
  let tier: ConfidenceTier
  if (gap < 0.1 || top < 0.4) tier = 'tossup'
  else if (top >= 0.55 && gap >= 0.15) tier = 'clear'
  else tier = 'lean'
  return { tier, label: LABEL_3WAY[tier], top, gap }
}

/**
 * Binary market (Over/Under, BTTS Yes/No). Decisiveness is distance from a coin-
 * flip, so the favoured side = max(p, 1-p). A two-way market needs its OWN
 * thresholds — a 55/45 still reads as a tossup, where a 1X2 favourite at 45% may
 * not — so we tier on the favourite's probability, not the 1X2 gap.
 */
export function confidenceBinary(p: number): Confidence {
  const top = Math.max(p, 1 - p)
  const gap = top - (1 - top) // = |2p − 1|
  let tier: ConfidenceTier
  if (top < 0.58) tier = 'tossup'
  else if (top >= 0.67) tier = 'clear'
  else tier = 'lean'
  return { tier, label: TIER_LABEL[tier], top, gap }
}

export interface TierStats {
  tier: ConfidenceTier
  label: string
  n: number
  hits: number
  hitRate: number
  /** Mean probability the model gave its favourite — the hit rate it implied. */
  meanTop: number
}

const TIER_ORDER: ConfidenceTier[] = ['clear', 'lean', 'tossup']

/**
 * Group scored outcomes by confidence tier and report the realised hit rate
 * against the rate the model implied (meanTop). This is how the colours get
 * *earned*: a "clear" bucket should both out-hit a "tossup" bucket and land near
 * its own implied probability. Market-agnostic — pass the per-item Confidence
 * (from confidence1x2 or confidenceBinary). Returns all three tiers, in order.
 */
export function hitRatesByTier(items: { c: Confidence; hit: boolean }[]): TierStats[] {
  return TIER_ORDER.map((tier) => {
    const inTier = items.filter((it) => it.c.tier === tier)
    const n = inTier.length
    const hits = inTier.filter((it) => it.hit).length
    const meanTop = n ? inTier.reduce((s, it) => s + it.c.top, 0) / n : 0
    return { tier, label: TIER_LABEL[tier], n, hits, hitRate: n ? hits / n : 0, meanTop }
  })
}

export interface CalibrationBin {
  label: string
  lo: number
  hi: number
  n: number
  /** Mean probability the model assigned in this bin. */
  predicted: number
  /** Fraction of those forecasts that actually came true. */
  observed: number
}

const DEFAULT_EDGES = [0, 0.2, 0.4, 0.6, 0.8, 1.0001]

/**
 * Reliability curve: bucket (probability, did-it-happen) pairs by predicted
 * probability and compare the mean prediction to the realised frequency. A
 * calibrated model sits on the diagonal — predicted ≈ observed in every bin.
 * Feed it one pair per outcome (e.g. all three 1X2 outcomes of every match).
 */
export function reliabilityCurve(
  items: { p: number; hit: boolean }[],
  edges: number[] = DEFAULT_EDGES,
): CalibrationBin[] {
  const bins: CalibrationBin[] = []
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i]
    const hi = edges[i + 1]
    const inBin = items.filter((it) => it.p >= lo && it.p < hi)
    const n = inBin.length
    bins.push({
      label: `${Math.round(lo * 100)}–${Math.round(Math.min(hi, 1) * 100)}%`,
      lo,
      hi,
      n,
      predicted: n ? inBin.reduce((s, it) => s + it.p, 0) / n : 0,
      observed: n ? inBin.filter((it) => it.hit).length / n : 0,
    })
  }
  return bins
}

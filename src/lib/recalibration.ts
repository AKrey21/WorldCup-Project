// In-tournament goal-environment recalibration.
//
// The Dixon-Coles model's goal level is anchored to ~11,900 historical
// internationals (~2.6 goals/game). When a tournament runs hotter or colder than
// that baseline, every expected-goals (lambda) is biased the same way — which
// under- or over-states the goal-derived markets (BTTS and Over especially). We
// measure the ratio of goals actually scored to goals the model expected over the
// games played so far, SHRINK it toward 1 (no change) so a small, upset-heavy
// sample can't swing it wildly, and scale every forward lambda by the result.
// Adaptive: the adjustment strengthens as more matchdays land.
//
// This adjusts the FORWARD board only. The Results recap deliberately scores the
// un-adjusted pre-tournament model — that is the honest held-out test the scale is
// measured against, so recalibrating it would defeat the purpose.

import playedData from '../data/played.json'
import { lambdasFor, type FittedModel } from './model/fit'

interface PlayedRow {
  home: string
  away: string
  homeScore: number
  awayScore: number
  neutral: number
}

// Pseudo-matches pulling the scale toward 1. With n real games the raw signal
// gets weight n/(n+K); K=16 means ~24 games carry ~60% of it — responsive to a
// real shift, but not hostage to one wild matchday.
const SHRINK_PSEUDO = 16

export interface GoalEnvironment {
  /** Multiplier applied to every forward lambda (1 = no change). */
  scale: number
  /** Unshrunk observed/expected goals ratio. */
  rawScale: number
  /** Played games the model could price (the estimate's sample size). */
  n: number
  observedGpg: number
  expectedGpg: number
}

/**
 * Estimate the tournament's goal environment relative to what `model` expects,
 * using the games played so far. Self-consistent: pass the same model you score
 * the board with, and the scale captures only the *residual* goal bias — so if the
 * model already reflects the hot run, the adjustment is correctly small.
 */
export function goalEnvironment(model: FittedModel): GoalEnvironment {
  const rows = playedData.matches as PlayedRow[]
  let obs = 0
  let exp = 0
  let n = 0
  for (const m of rows) {
    const lam = lambdasFor(model, m.home, m.away, Boolean(m.neutral))
    if (!lam) continue
    obs += m.homeScore + m.awayScore
    exp += lam.lh + lam.la
    n += 1
  }
  const rawScale = exp > 0 ? obs / exp : 1
  const w = n / (n + SHRINK_PSEUDO)
  const scale = 1 + w * (rawScale - 1)
  return {
    scale,
    rawScale,
    n,
    observedGpg: n ? obs / n : 0,
    expectedGpg: n ? exp / n : 0,
  }
}

// Bootstrap uncertainty on the model's probabilities.
//
// A point estimate like "48% Mexico" hides how *sure* the model is — 48% built on
// thousands of matches is firmer than 48% built on a handful. We quantify that by
// the nonparametric bootstrap: resample the historical matches with replacement,
// refit, and recompute the fixture's probabilities; repeat. The spread (standard
// deviation) of those probabilities across refits is the uncertainty band. Teams
// the model knows well get tight bands; thin-data teams get wide ones.
//
// Each refit costs ~180ms, so this is opt-in and computed once (cached), never on
// the critical render path.

import { fitDixonColes, lambdasFor, type FittedModel, type RawMatch } from './model/fit'
import { scoreMatrix, outcomeProbs } from './model/dixon-coles'

// Seeded LCG — deterministic resampling so the bands are stable and testable
// (and we never reach for the non-deterministic Math.random).
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

// The bootstrap is expensive (~10 refits) but deterministic and dataset-static,
// so one cached set serves every render once computed.
let cached: FittedModel[] | null = null

export function bootstrapReady(): boolean {
  return cached !== null
}

/** Lazily compute (once) and return the cached bootstrap ensemble. Blocks on first call. */
export function getBootstrapModels(matches: RawMatch[], reps = 10): FittedModel[] {
  if (!cached) cached = bootstrapModels(matches, reps)
  return cached
}

/** Fit `reps` models, each on a bootstrap resample (with replacement) of `matches`. */
export function bootstrapModels(matches: RawMatch[], reps = 10, seed = 1234): FittedModel[] {
  const n = matches.length
  if (n === 0) return []
  // Pin asOf to the real latest date so resampling can't shift the time-decay anchor.
  const asOf = matches.reduce((mx, m) => (m.date > mx ? m.date : mx), matches[0].date)
  const models: FittedModel[] = []
  for (let r = 0; r < reps; r++) {
    const rand = lcg(seed + r * 2654435761)
    const sample: RawMatch[] = new Array(n)
    for (let i = 0; i < n; i++) sample[i] = matches[Math.floor(rand() * n)]
    models.push(fitDixonColes(sample, { asOf }))
  }
  return models
}

export interface Spread {
  mean: number
  sd: number
}

export interface ProbBand {
  /** Std of the favoured outcome's probability across refits — the headline band. */
  sd: number
  home: Spread
  draw: Spread
  away: Spread
}

/** Mean and bootstrap std of each 1X2 outcome for a fixture. Null if a team is unseen. */
export function probabilityBand(
  models: FittedModel[],
  home: string,
  away: string,
  neutral: boolean,
  goalScale = 1,
): ProbBand | null {
  const hs: number[] = []
  const ds: number[] = []
  const aws: number[] = []
  for (const m of models) {
    const lam = lambdasFor(m, home, away, neutral)
    if (!lam) continue
    const x = outcomeProbs(scoreMatrix(lam.lh * goalScale, lam.la * goalScale, m.rho))
    hs.push(x.home)
    ds.push(x.draw)
    aws.push(x.away)
  }
  if (hs.length < 2) return null
  const spread = (a: number[]): Spread => {
    const mean = a.reduce((s, v) => s + v, 0) / a.length
    const sd = Math.sqrt(a.reduce((s, v) => s + (v - mean) ** 2, 0) / (a.length - 1))
    return { mean, sd }
  }
  const home_ = spread(hs)
  const draw_ = spread(ds)
  const away_ = spread(aws)
  const top = [home_, draw_, away_].reduce((x, y) => (y.mean > x.mean ? y : x))
  return { sd: top.sd, home: home_, draw: draw_, away: away_ }
}

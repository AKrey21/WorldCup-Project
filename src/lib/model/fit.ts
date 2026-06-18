// Fitting the Dixon-Coles strength model from historical results.
//
// Model (log link):
//   log lambda_home = c + atk[home] - def[away] + gamma * (home not neutral)
//   log lambda_away = c + atk[away] - def[home]
//
// We maximise a weighted Poisson log-likelihood, where each match is weighted by
//   w = importance * 0.5 ^ (ageInYears / halfLife)
// so recent, high-stakes games dominate — Dixon & Coles' time-decay idea.
//
// atk/def are fit first (the rho correction barely moves them), then rho is fit
// by a 1-D search on the full Dixon-Coles likelihood holding strengths fixed.
//
// The optimiser is diagonal-Newton coordinate ascent: for each parameter we know
// the exact Poisson curvature (the expected goal count), so the step
// grad / curvature is naturally scaled — no learning-rate tuning, no blow-ups.

import { tau } from './dixon-coles'

export interface RawMatch {
  date: string // YYYY-MM-DD
  home: string
  away: string
  homeScore: number
  awayScore: number
  neutral: number // 0 | 1
  importance: number
}

export interface FitOptions {
  /** Reference date for time-decay. Defaults to the latest match in the data. */
  asOf?: string
  /** Weight halves every this many years. */
  halfLifeYears?: number
  /** L2 shrinkage on attack/defense — pulls thin-sample teams toward average. */
  ridge?: number
  maxIterations?: number
  /** Stop when the largest parameter change in an iteration is below this. */
  tolerance?: number
  /**
   * Fraction of each Newton step actually taken. Diagonal-Newton ignores the
   * coupling between the intercept and home-advantage terms and overshoots at
   * full step; damping keeps it stable. 1 = undamped.
   */
  damping?: number
}

export interface FittedModel {
  teams: string[]
  index: Map<string, number>
  atk: number[]
  def: number[]
  c: number
  gamma: number
  rho: number
  /** Effective (time-decayed) number of matches each team contributes to. */
  weightPerTeam: number[]
  asOf: string
  halfLifeYears: number
  iterations: number
  logLik: number
}

const MS_PER_DAY = 86_400_000
const DAYS_PER_YEAR = 365.25

function toDayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / MS_PER_DAY
}

export function fitDixonColes(matches: RawMatch[], opts: FitOptions = {}): FittedModel {
  const halfLifeYears = opts.halfLifeYears ?? 2
  const ridge = opts.ridge ?? 0.05
  const maxIterations = opts.maxIterations ?? 500
  const tolerance = opts.tolerance ?? 1e-6
  const damping = opts.damping ?? 0.7

  // Index teams.
  const index = new Map<string, number>()
  const teams: string[] = []
  for (const m of matches) {
    for (const t of [m.home, m.away]) {
      if (!index.has(t)) {
        index.set(t, teams.length)
        teams.push(t)
      }
    }
  }
  const T = teams.length

  // Precompute per-match weight and team indices.
  const asOfDay = toDayNumber(
    opts.asOf ?? matches.reduce((mx, m) => (m.date > mx ? m.date : mx), matches[0]?.date ?? '2000-01-01'),
  )
  const decay = Math.LN2 / halfLifeYears
  const hi: number[] = new Array(matches.length)
  const ai: number[] = new Array(matches.length)
  const hs: number[] = new Array(matches.length)
  const as: number[] = new Array(matches.length)
  const home1: number[] = new Array(matches.length) // 1 if home advantage applies
  const w: number[] = new Array(matches.length)
  const weightPerTeam = new Array(T).fill(0)

  for (let k = 0; k < matches.length; k++) {
    const m = matches[k]
    const ageYears = (asOfDay - toDayNumber(m.date)) / DAYS_PER_YEAR
    const weight = m.importance * Math.exp(-decay * Math.max(0, ageYears))
    hi[k] = index.get(m.home)!
    ai[k] = index.get(m.away)!
    hs[k] = m.homeScore
    as[k] = m.awayScore
    home1[k] = m.neutral ? 0 : 1
    w[k] = weight
    weightPerTeam[hi[k]] += weight
    weightPerTeam[ai[k]] += weight
  }

  // Parameters.
  const atk = new Array(T).fill(0)
  const def = new Array(T).fill(0)
  let c = Math.log(
    Math.max(0.1, (sum(hs, w) + sum(as, w)) / (2 * w.reduce((a, b) => a + b, 0) || 1)),
  )
  let gamma = 0.25

  let iterations = 0
  for (; iterations < maxIterations; iterations++) {
    const gAtk = new Array(T).fill(0)
    const cAtk = new Array(T).fill(0)
    const gDef = new Array(T).fill(0)
    const cDef = new Array(T).fill(0)
    let gC = 0
    let cC = 0
    let gGamma = 0
    let cGamma = 0

    for (let k = 0; k < matches.length; k++) {
      const h = hi[k]
      const a = ai[k]
      const wk = w[k]
      const lh = Math.exp(c + atk[h] - def[a] + gamma * home1[k])
      const la = Math.exp(c + atk[a] - def[h])

      const rh = wk * (hs[k] - lh) // d loglik / d(logLambdaHome)
      const ra = wk * (as[k] - la)
      const ch = wk * lh // Poisson curvature (expected count)
      const ca = wk * la

      // atk[home] and atk[away] enter their own team's lambda with coef +1.
      gAtk[h] += rh
      cAtk[h] += ch
      gAtk[a] += ra
      cAtk[a] += ca
      // def[away] enters home lambda, def[home] enters away lambda, coef -1.
      gDef[a] += -rh
      cDef[a] += ch
      gDef[h] += -ra
      cDef[h] += ca

      gC += rh + ra
      cC += ch + ca
      gGamma += rh * home1[k]
      cGamma += ch * home1[k]
    }

    let maxDelta = 0
    for (let t = 0; t < T; t++) {
      const da = (damping * (gAtk[t] - ridge * atk[t])) / (cAtk[t] + ridge)
      const dd = (damping * (gDef[t] - ridge * def[t])) / (cDef[t] + ridge)
      atk[t] += da
      def[t] += dd
      maxDelta = Math.max(maxDelta, Math.abs(da), Math.abs(dd))
    }
    const dc = (damping * gC) / (cC + 1e-9)
    const dg = (damping * gGamma) / (cGamma + 1e-9)
    c += dc
    gamma += dg
    maxDelta = Math.max(maxDelta, Math.abs(dc), Math.abs(dg))

    // Identifiability: attack and defense are only defined up to a shared
    // constant. Center them; the intercept c absorbs the overall goal level.
    recenter(atk)
    recenter(def)

    if (maxDelta < tolerance) {
      iterations++
      break
    }
  }

  const rho = fitRho(matches.length, hi, ai, hs, as, home1, w, atk, def, c, gamma)
  const logLik = fullLogLik(matches.length, hi, ai, hs, as, home1, w, atk, def, c, gamma, rho)

  return {
    teams,
    index,
    atk,
    def,
    c,
    gamma,
    rho,
    weightPerTeam,
    asOf: opts.asOf ?? new Date(asOfDay * MS_PER_DAY).toISOString().slice(0, 10),
    halfLifeYears,
    iterations,
    logLik,
  }
}

function recenter(arr: number[]) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  for (let i = 0; i < arr.length; i++) arr[i] -= mean
}

function sum(values: number[], weights: number[]): number {
  let s = 0
  for (let i = 0; i < values.length; i++) s += values[i] * weights[i]
  return s
}

// 1-D fit of rho on the Dixon-Coles low-score correction, strengths held fixed.
// Golden-section search over a range where tau stays positive for all matches.
function fitRho(
  n: number,
  hi: number[],
  ai: number[],
  hs: number[],
  as: number[],
  home1: number[],
  w: number[],
  atk: number[],
  def: number[],
  c: number,
  gamma: number,
): number {
  const lh = new Array(n)
  const la = new Array(n)
  let maxProduct = 0
  for (let k = 0; k < n; k++) {
    lh[k] = Math.exp(c + atk[hi[k]] - def[ai[k]] + gamma * home1[k])
    la[k] = Math.exp(c + atk[ai[k]] - def[hi[k]])
    maxProduct = Math.max(maxProduct, lh[k] * la[k])
  }
  // tau(0,0) = 1 - lh*la*rho must stay > 0 -> rho < 1/max(lh*la).
  const hardUpper = maxProduct > 0 ? 0.99 / maxProduct : 0.3
  let lo = -0.2
  let hiB = Math.min(0.2, hardUpper)
  if (hiB <= lo) return 0

  const tauLogLik = (rho: number) => {
    let s = 0
    for (let k = 0; k < n; k++) {
      const i = hs[k]
      const j = as[k]
      if (i > 1 || j > 1) continue // tau = 1 outside the low-score block
      const t = tau(i, j, lh[k], la[k], rho)
      if (t <= 0) return -Infinity
      s += w[k] * Math.log(t)
    }
    return s
  }

  const gr = (Math.sqrt(5) - 1) / 2
  let x1 = hiB - gr * (hiB - lo)
  let x2 = lo + gr * (hiB - lo)
  let f1 = tauLogLik(x1)
  let f2 = tauLogLik(x2)
  for (let iter = 0; iter < 80 && hiB - lo > 1e-5; iter++) {
    if (f1 < f2) {
      lo = x1
      x1 = x2
      f1 = f2
      x2 = lo + gr * (hiB - lo)
      f2 = tauLogLik(x2)
    } else {
      hiB = x2
      x2 = x1
      f2 = f1
      x1 = hiB - gr * (hiB - lo)
      f1 = tauLogLik(x1)
    }
  }
  return (lo + hiB) / 2
}

function fullLogLik(
  n: number,
  hi: number[],
  ai: number[],
  hs: number[],
  as: number[],
  home1: number[],
  w: number[],
  atk: number[],
  def: number[],
  c: number,
  gamma: number,
  rho: number,
): number {
  let s = 0
  for (let k = 0; k < n; k++) {
    const lh = Math.exp(c + atk[hi[k]] - def[ai[k]] + gamma * home1[k])
    const la = Math.exp(c + atk[ai[k]] - def[hi[k]])
    const t = tau(hs[k], as[k], lh, la, rho)
    // Poisson log-pmf without the constant log(k!) term (irrelevant to the fit).
    const lp = hs[k] * Math.log(lh) - lh + as[k] * Math.log(la) - la
    s += w[k] * (lp + (t > 0 ? Math.log(t) : 0))
  }
  return s
}

/** Expected goals for a fixture. Returns null if either team is unknown. */
export function lambdasFor(
  model: FittedModel,
  home: string,
  away: string,
  neutral: boolean,
): { lh: number; la: number } | null {
  const h = model.index.get(home)
  const a = model.index.get(away)
  if (h === undefined || a === undefined) return null
  const homeAdv = neutral ? 0 : model.gamma
  return {
    lh: Math.exp(model.c + model.atk[h] - model.def[a] + homeAdv),
    la: Math.exp(model.c + model.atk[a] - model.def[h]),
  }
}

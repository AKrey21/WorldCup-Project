// Dixon-Coles scoreline model.
//
// Two independent Poissons (one per team's goals) systematically over-state
// draws and 0-0/1-0/0-1 in low-scoring games. Dixon & Coles (1997) correct the
// four low-score cells with a single dependence parameter rho. Everything a
// punter cares about — 1X2, over/under, BTTS, the most likely score — is then
// just a sum over cells of the resulting score matrix.

import { poissonPmf } from './poisson'

/** Low-score dependence correction. rho ~ 0 recovers plain double-Poisson. */
export function tau(i: number, j: number, lh: number, la: number, rho: number): number {
  if (i === 0 && j === 0) return 1 - lh * la * rho
  if (i === 0 && j === 1) return 1 + lh * rho
  if (i === 1 && j === 0) return 1 + la * rho
  if (i === 1 && j === 1) return 1 - rho
  return 1
}

export interface ScoreMatrix {
  /** m[i][j] = P(home scores i, away scores j). Rows/cols 0..maxGoals. Sums to 1. */
  m: number[][]
  maxGoals: number
  lh: number
  la: number
  rho: number
}

/**
 * Joint scoreline distribution. Truncated at maxGoals (the tail beyond ~10
 * carries negligible mass for football lambdas) and renormalised to sum to 1,
 * which also absorbs the tiny mass shifted by tau.
 */
export function scoreMatrix(lh: number, la: number, rho: number, maxGoals = 10): ScoreMatrix {
  const m: number[][] = []
  let total = 0
  for (let i = 0; i <= maxGoals; i++) {
    const ph = poissonPmf(i, lh)
    const row: number[] = []
    for (let j = 0; j <= maxGoals; j++) {
      const cell = ph * poissonPmf(j, la) * tau(i, j, lh, la, rho)
      // tau can dip slightly negative for extreme rho; clamp to keep a valid pmf.
      const safe = cell > 0 ? cell : 0
      row.push(safe)
      total += safe
    }
    m.push(row)
  }
  if (total > 0) {
    for (let i = 0; i <= maxGoals; i++)
      for (let j = 0; j <= maxGoals; j++) m[i][j] /= total
  }
  return { m, maxGoals, lh, la, rho }
}

export interface OneXTwo {
  home: number
  draw: number
  away: number
}

/** Match-result (1X2) probabilities. */
export function outcomeProbs({ m, maxGoals }: ScoreMatrix): OneXTwo {
  let home = 0
  let draw = 0
  let away = 0
  for (let i = 0; i <= maxGoals; i++)
    for (let j = 0; j <= maxGoals; j++) {
      if (i > j) home += m[i][j]
      else if (i === j) draw += m[i][j]
      else away += m[i][j]
    }
  return { home, draw, away }
}

/** P(total goals > line) and P(< line). Use a .5 line to avoid pushes. */
export function overUnder({ m, maxGoals }: ScoreMatrix, line = 2.5): { over: number; under: number } {
  let over = 0
  for (let i = 0; i <= maxGoals; i++)
    for (let j = 0; j <= maxGoals; j++) if (i + j > line) over += m[i][j]
  return { over, under: 1 - over }
}

/** Both teams to score. */
export function bttsProbs({ m, maxGoals }: ScoreMatrix): { yes: number; no: number } {
  let yes = 0
  for (let i = 1; i <= maxGoals; i++) for (let j = 1; j <= maxGoals; j++) yes += m[i][j]
  return { yes, no: 1 - yes }
}

export interface Scoreline {
  home: number
  away: number
  prob: number
}

/** The single most probable exact scoreline. */
export function mostLikelyScore({ m, maxGoals }: ScoreMatrix): Scoreline {
  let best: Scoreline = { home: 0, away: 0, prob: -1 }
  for (let i = 0; i <= maxGoals; i++)
    for (let j = 0; j <= maxGoals; j++)
      if (m[i][j] > best.prob) best = { home: i, away: j, prob: m[i][j] }
  return best
}

/** Top-N exact scorelines, most likely first. */
export function topScorelines(sm: ScoreMatrix, n = 5): Scoreline[] {
  const all: Scoreline[] = []
  for (let i = 0; i <= sm.maxGoals; i++)
    for (let j = 0; j <= sm.maxGoals; j++) all.push({ home: i, away: j, prob: sm.m[i][j] })
  all.sort((a, b) => b.prob - a.prob)
  return all.slice(0, n)
}

/** P(total goals = k) for k = 0..2*maxGoals — the goals-distribution histogram. */
export function totalGoalsDistribution({ m, maxGoals }: ScoreMatrix): number[] {
  const dist = new Array(2 * maxGoals + 1).fill(0)
  for (let i = 0; i <= maxGoals; i++)
    for (let j = 0; j <= maxGoals; j++) dist[i + j] += m[i][j]
  return dist
}

/** Odd vs even total goals. */
export function oddEvenProbs({ m, maxGoals }: ScoreMatrix): { odd: number; even: number } {
  let odd = 0
  for (let i = 0; i <= maxGoals; i++)
    for (let j = 0; j <= maxGoals; j++) if ((i + j) % 2 === 1) odd += m[i][j]
  return { odd, even: 1 - odd }
}

/**
 * European goal handicap on the home side. `homeLine` is the handicap applied to
 * the home team (e.g. -1.5 = "home −1.5", +1.5 = "home +1.5"). Use a .5 line so
 * there are no pushes. Returns the probability each side covers.
 */
export function handicapProbs(
  { m, maxGoals }: ScoreMatrix,
  homeLine: number,
): { home: number; away: number } {
  let home = 0
  for (let i = 0; i <= maxGoals; i++)
    for (let j = 0; j <= maxGoals; j++) if (i - j + homeLine > 0) home += m[i][j]
  return { home, away: 1 - home }
}

/** One side of an Asian handicap, with full settlement-category masses. */
export interface AsianSide {
  /** Stake-weighted cover probability: win + ½·half-win. */
  prob: number
  /** EV-neutral decimal odds (accounts for pushes returning stake). */
  fairOdds: number
  win: number
  halfWin: number
  push: number
  halfLoss: number
  loss: number
}

// A quarter line (…±0.25, ±0.75) settles as two half-stakes at the two adjacent
// 0.5-step lines; whole/half lines are a single line.
function quarterSplit(h: number): number[] {
  const q = Math.round(h * 4)
  return Math.abs(q % 2) === 1 ? [(q - 1) / 4, (q + 1) / 4] : [q / 4]
}

function asianSide(win: number, halfWin: number, push: number, halfLoss: number, loss: number): AsianSide {
  const denom = win + 0.5 * halfWin
  const fairOdds = denom > 0 ? (1 - 0.5 * halfWin - push - 0.5 * halfLoss) / denom : Infinity
  return { prob: denom, fairOdds, win, halfWin, push, halfLoss, loss }
}

/**
 * Asian handicap on a `homeLine` (negative = home favoured, e.g. -0.75). Handles
 * whole-line pushes and quarter-line half-stake splits. The away side is the
 * mirror at the opposite line. Goal margins are integers, so a quarter line only
 * ever produces a half-win or half-loss — never a one-wins-one-loses split.
 */
export function asianHandicap({ m, maxGoals }: ScoreMatrix, homeLine: number): {
  home: AsianSide
  away: AsianSide
} {
  const subs = quarterSplit(homeLine)
  let win = 0
  let halfWin = 0
  let push = 0
  let halfLoss = 0
  let loss = 0
  for (let i = 0; i <= maxGoals; i++)
    for (let j = 0; j <= maxGoals; j++) {
      const p = m[i][j]
      if (p <= 0) continue
      const margin = i - j
      let s = 0
      for (const ln of subs) {
        const r = margin + ln
        s += r > 0 ? 1 : r < 0 ? -1 : 0
      }
      const u = s / subs.length // one of 1, 0.5, 0, -0.5, -1
      if (u === 1) win += p
      else if (u === 0.5) halfWin += p
      else if (u === 0) push += p
      else if (u === -0.5) halfLoss += p
      else loss += p
    }
  return {
    home: asianSide(win, halfWin, push, halfLoss, loss),
    away: asianSide(loss, halfLoss, push, halfWin, win), // mirror
  }
}

/** EV per $1 staked on an Asian-handicap side at `bookOdds` (push-aware). */
export function asianHandicapEv(side: AsianSide, bookOdds: number): number {
  return (
    bookOdds * (side.win + 0.5 * side.halfWin) +
    0.5 * side.halfWin +
    side.push +
    0.5 * side.halfLoss -
    1
  )
}

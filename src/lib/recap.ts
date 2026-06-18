// Out-of-sample recap — the model's report card.
//
// The Dixon-Coles model is fit only on pre-tournament international results (it
// has never seen a 2026 World Cup game). As matches are played we can therefore
// ask the honest question the whole lab is built around: was the model actually
// calibrated? Each played match is re-run through the cached model and compared
// to what really happened — favoured 1X2 outcome, over/under 2.5, both-teams-to-
// score — and scored with Brier and log-loss, the standard probabilistic-forecast
// metrics. This is a genuine held-out test, not a backfit, because played.json is
// deliberately kept out of the training data.

import played from '../data/played.json'
import { lambdasFor, type FittedModel } from './model/fit'
import { scoreMatrix, outcomeProbs, overUnder, bttsProbs, mostLikelyScore } from './model/dixon-coles'
import { TOTAL_LINE } from './bestbets'

export interface PlayedMatch {
  date: string
  home: string
  away: string
  homeScore: number
  awayScore: number
  neutral: number
  group?: string
  /** Best-available pre-match 1X2 decimal odds, for the model-vs-market benchmark. */
  odds?: { home: number; draw: number; away: number }
}

/**
 * Strip the bookmaker's margin from a 1X2 price set. Raw 1/odds across the three
 * outcomes sums to >1 (the overround); normalising back to 1 recovers the book's
 * own probability estimate — the thing the model actually has to beat.
 */
export function devig1x2(odds: { home: number; draw: number; away: number }): {
  home: number
  draw: number
  away: number
} {
  const ih = 1 / odds.home
  const id = 1 / odds.draw
  const ia = 1 / odds.away
  const s = ih + id + ia
  return { home: ih / s, draw: id / s, away: ia / s }
}

export function loadPlayedResults(): PlayedMatch[] {
  return (played.matches as PlayedMatch[]).slice()
}

export function playedAsOf(): string {
  return (played as { asOf?: string }).asOf ?? ''
}

export type Outcome = 'home' | 'draw' | 'away'

export function outcomeOf(homeGoals: number, awayGoals: number): Outcome {
  return homeGoals > awayGoals ? 'home' : homeGoals < awayGoals ? 'away' : 'draw'
}

export interface RecapRow {
  date: string
  home: string
  away: string
  homeScore: number
  awayScore: number
  neutral: boolean
  group?: string
  /** Model expected goals. */
  lh: number
  la: number
  probs: { home: number; draw: number; away: number }
  pOver: number
  pBttsYes: number
  /** Model's single most likely scoreline. */
  predScore: { home: number; away: number }
  modelPick: Outcome
  actual: Outcome
  outcomeHit: boolean
  ouHit: boolean
  bttsHit: boolean
  exactHit: boolean
  /** Multiclass Brier over the three 1X2 outcomes (0 = perfect, 2 = worst). */
  brier: number
  /** −ln(probability the model gave the actual outcome). Lower is better. */
  logLoss: number
  /** The de-vigged book line scored the same way — present only if odds exist. */
  market?: {
    probs: { home: number; draw: number; away: number }
    brier: number
    logLoss: number
    /** True if the model gave the actual outcome a higher probability than the book did. */
    modelSharper: boolean
  }
}

/** Head-to-head of model vs de-vigged market on the matches that have odds. */
export interface MarketComparison {
  /** Matches with odds (the comparison's sample size). */
  n: number
  modelBrier: number
  marketBrier: number
  modelLogLoss: number
  marketLogLoss: number
  /** 1 − modelBrier/marketBrier. >0 means the model beats the book; 0 = parity. */
  brierSkillScore: number
  /** Matches where the model gave the actual result a higher probability than the book. */
  modelSharperCount: number
}

export interface RecapSummary {
  n: number
  outcomeHits: number
  outcomeHitRate: number
  ouHits: number
  ouHitRate: number
  bttsHits: number
  bttsHitRate: number
  exactHits: number
  meanBrier: number
  meanLogLoss: number
  /** Reference: an uninformed 1/3-1/3-1/3 forecast scores this Brier (2/3). */
  uniformBrier: number
  /** Reference: log-loss of that same uniform forecast (ln 3 ≈ 1.0986). */
  uniformLogLoss: number
}

export interface Recap {
  rows: RecapRow[]
  /** Matches dropped because a team is absent from the model. */
  skipped: PlayedMatch[]
  summary: RecapSummary
  /** Model vs the book on the matches that carry odds; null if none do. */
  market: MarketComparison | null
  asOf: string
}

// An uninformed forecast that splits 1/3 across each 1X2 outcome — the bar the
// model has to beat to be worth anything.
const UNIFORM_BRIER = (1 / 3 - 1) ** 2 + (1 / 3) ** 2 + (1 / 3) ** 2 // = 2/3
const UNIFORM_LOGLOSS = Math.log(3) // ≈ 1.0986

function argmaxOutcome(home: number, draw: number, away: number): Outcome {
  if (home >= draw && home >= away) return 'home'
  if (away >= draw && away >= home) return 'away'
  return 'draw'
}

type Probs = { home: number; draw: number; away: number }

/** Multiclass Brier of a 1X2 forecast against the one-hot actual outcome. */
function brierOf(p: Probs, actual: Outcome): number {
  return (
    (p.home - (actual === 'home' ? 1 : 0)) ** 2 +
    (p.draw - (actual === 'draw' ? 1 : 0)) ** 2 +
    (p.away - (actual === 'away' ? 1 : 0)) ** 2
  )
}

function probOf(p: Probs, actual: Outcome): number {
  return actual === 'home' ? p.home : actual === 'away' ? p.away : p.draw
}

/** Score every played match against the model. Pure — takes the model in. */
export function buildRecap(model: FittedModel, matches: PlayedMatch[]): Recap {
  const rows: RecapRow[] = []
  const skipped: PlayedMatch[] = []

  for (const m of matches) {
    const lam = lambdasFor(model, m.home, m.away, Boolean(m.neutral))
    if (!lam) {
      skipped.push(m)
      continue
    }
    const sm = scoreMatrix(lam.lh, lam.la, model.rho)
    const x = outcomeProbs(sm)
    const ou = overUnder(sm, TOTAL_LINE)
    const btts = bttsProbs(sm)
    const top = mostLikelyScore(sm)

    const actual = outcomeOf(m.homeScore, m.awayScore)
    const modelPick = argmaxOutcome(x.home, x.draw, x.away)
    const actualOver = m.homeScore + m.awayScore > TOTAL_LINE
    const actualBtts = m.homeScore > 0 && m.awayScore > 0

    const modelProbs: Probs = { home: x.home, draw: x.draw, away: x.away }
    const brier = brierOf(modelProbs, actual)
    const pActual = Math.max(probOf(modelProbs, actual), 1e-12)

    // De-vig the book line and score it the same way, when odds are present.
    let market: RecapRow['market']
    if (m.odds) {
      const mp = devig1x2(m.odds)
      market = {
        probs: mp,
        brier: brierOf(mp, actual),
        logLoss: -Math.log(Math.max(probOf(mp, actual), 1e-12)),
        modelSharper: probOf(modelProbs, actual) > probOf(mp, actual),
      }
    }

    rows.push({
      date: m.date,
      home: m.home,
      away: m.away,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      neutral: Boolean(m.neutral),
      group: m.group,
      lh: lam.lh,
      la: lam.la,
      probs: modelProbs,
      pOver: ou.over,
      pBttsYes: btts.yes,
      predScore: { home: top.home, away: top.away },
      modelPick,
      actual,
      outcomeHit: modelPick === actual,
      ouHit: (ou.over >= 0.5) === actualOver,
      bttsHit: (btts.yes >= 0.5) === actualBtts,
      exactHit: top.home === m.homeScore && top.away === m.awayScore,
      brier,
      logLoss: -Math.log(pActual),
      market,
    })
  }

  rows.sort((a, b) => b.date.localeCompare(a.date) || `${a.home}`.localeCompare(b.home))

  const n = rows.length
  const mean = (f: (r: RecapRow) => number) => (n ? rows.reduce((s, r) => s + f(r), 0) / n : 0)
  const count = (f: (r: RecapRow) => boolean) => rows.filter(f).length

  // Model vs the book, on the subset of matches that carry odds. Both sides are
  // scored on the same matches, so the Brier Skill Score is a fair head-to-head.
  const priced = rows.filter((r): r is RecapRow & { market: NonNullable<RecapRow['market']> } =>
    r.market !== undefined,
  )
  let market: MarketComparison | null = null
  if (priced.length > 0) {
    const k = priced.length
    const avg = (f: (r: (typeof priced)[number]) => number) =>
      priced.reduce((s, r) => s + f(r), 0) / k
    const modelBrier = avg((r) => r.brier)
    const marketBrier = avg((r) => r.market.brier)
    market = {
      n: k,
      modelBrier,
      marketBrier,
      modelLogLoss: avg((r) => r.logLoss),
      marketLogLoss: avg((r) => r.market.logLoss),
      brierSkillScore: marketBrier > 0 ? 1 - modelBrier / marketBrier : 0,
      modelSharperCount: priced.filter((r) => r.market.modelSharper).length,
    }
  }

  return {
    rows,
    skipped,
    market,
    asOf: playedAsOf(),
    summary: {
      n,
      outcomeHits: count((r) => r.outcomeHit),
      outcomeHitRate: n ? count((r) => r.outcomeHit) / n : 0,
      ouHits: count((r) => r.ouHit),
      ouHitRate: n ? count((r) => r.ouHit) / n : 0,
      bttsHits: count((r) => r.bttsHit),
      bttsHitRate: n ? count((r) => r.bttsHit) / n : 0,
      exactHits: count((r) => r.exactHit),
      meanBrier: mean((r) => r.brier),
      meanLogLoss: mean((r) => r.logLoss),
      uniformBrier: UNIFORM_BRIER,
      uniformLogLoss: UNIFORM_LOGLOSS,
    },
  }
}

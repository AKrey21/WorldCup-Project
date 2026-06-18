// Model best-bets engine.
//
// Fits the Dixon-Coles strength model once from the historical international
// dataset, then runs every World Cup fixture through it to surface the model's
// favoured selection in each core market (1X2 / totals / both-teams-to-score).
// Each candidate carries the model probability and the implied *fair* odds; once
// a real book price is attached, edge and EV per $1 fall straight out of the
// existing ev helpers — this is the "do I have an edge?" question the lab asks,
// answered by the model instead of a gut estimate.

import results from '../data/results.json'
import fixturesData from '../data/fixtures.json'
import { fitDixonColes, lambdasFor, type FittedModel, type RawMatch } from './model/fit'
import {
  scoreMatrix,
  outcomeProbs,
  overUnder,
  bttsProbs,
  oddEvenProbs,
  mostLikelyScore,
  type OneXTwo,
  type Scoreline,
} from './model/dixon-coles'
import { expectedValue, impliedProb } from './ev'

export interface Fixture {
  date: string
  home: string
  away: string
  neutral: number
  tournament: string
}

export type MarketKind = '1X2' | 'Total' | 'BTTS' | 'OddEven'

/** The three markets shown on a match card; the rest live in the breakdown. */
export const CORE_MARKETS: MarketKind[] = ['1X2', 'Total', 'BTTS']

export type Tier = 'High' | 'Medium' | 'Low' | 'Pass' | 'Unpriced'

/** Per-fixture model output — the full picture behind the surfaced candidates. */
export interface FixtureAnalysis {
  fixtureId: string
  date: string
  home: string
  away: string
  neutral: boolean
  lh: number
  la: number
  /** Low-score dependence parameter — lets a detail view rebuild the score matrix. */
  rho: number
  x: OneXTwo
  ou: { over: number; under: number }
  btts: { yes: number; no: number }
  top: Scoreline
  /** Odd vs even total goals. */
  oe: { odd: number; even: number }
  /** A sensible default Asian-handicap line (home perspective) to start from. */
  hcapDefault: number
}

/** One surfaced best-bet row. Edge/EV are present only once a book price is set. */
export interface Candidate {
  fixtureId: string
  date: string
  home: string
  away: string
  neutral: boolean
  marketKind: MarketKind
  market: string
  selection: string
  /** Model probability of this selection, 0..1. */
  modelProb: number
  /** Break-even price for the model probability (1 / modelProb). */
  fairOdds: number
  /** Book decimal odds, when the user has attached one. */
  bookOdds?: number
  /** modelProb − book-implied probability, as a fraction. >0 means value. */
  edge?: number
  /** Expected value per $1 staked at the book price. */
  ev?: number
  tier: Tier
}

export const TOTAL_LINE = 2.5

const OVERROUND_NOTE =
  'Fair odds carry no margin. A real book price must clear them for the bet to be +EV.'

export { OVERROUND_NOTE }

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

export function loadHistoricalMatches(): RawMatch[] {
  return (results.matches as unknown[][]).map((row) => ({
    date: row[0] as string,
    home: row[1] as string,
    away: row[2] as string,
    homeScore: row[3] as number,
    awayScore: row[4] as number,
    neutral: row[5] as number,
    importance: row[6] as number,
  }))
}

export function loadFixtures(): Fixture[] {
  return (fixturesData.fixtures as Fixture[]).slice()
}

// The fit is deterministic and the dataset is static, so a single cached model
// serves every render and survives tab switches without refitting.
let cachedModel: FittedModel | null = null

export function modelReady(): boolean {
  return cachedModel !== null
}

export function getModel(): FittedModel {
  if (!cachedModel) cachedModel = fitDixonColes(loadHistoricalMatches())
  return cachedModel
}

// Kick-off of the 2026 World Cup. The upstream results feed already carries some
// of the tournament's own games, so a model fit on everything would be grading
// itself on matches it trained on. The Results recap therefore uses a model fit
// only on matches *before* this date — a genuine held-out test. The forward board
// keeps using the full model: it predicts later fixtures, so recent WC results are
// legitimate form, not leakage.
export const TOURNAMENT_START = '2026-06-11'

let cachedPreTournamentModel: FittedModel | null = null

/** Model fit only on internationals played before the World Cup kicked off. */
export function getPreTournamentModel(): FittedModel {
  if (!cachedPreTournamentModel) {
    const pre = loadHistoricalMatches().filter((m) => m.date < TOURNAMENT_START)
    cachedPreTournamentModel = fitDixonColes(pre)
  }
  return cachedPreTournamentModel
}

// ---------------------------------------------------------------------------
// Board construction
// ---------------------------------------------------------------------------

export function fixtureId(f: Pick<Fixture, 'date' | 'home' | 'away'>): string {
  return `${f.date}|${f.home}|${f.away}`
}

export function candidateKey(c: Candidate): string {
  return `${c.fixtureId}::${c.marketKind}`
}

function mkCandidate(
  a: FixtureAnalysis,
  marketKind: MarketKind,
  market: string,
  selection: string,
  modelProb: number,
): Candidate {
  return {
    fixtureId: a.fixtureId,
    date: a.date,
    home: a.home,
    away: a.away,
    neutral: a.neutral,
    marketKind,
    market,
    selection,
    modelProb,
    fairOdds: modelProb > 0 ? 1 / modelProb : Infinity,
    tier: 'Unpriced',
  }
}

export interface Board {
  analyses: Map<string, FixtureAnalysis>
  candidates: Candidate[]
  /** Fixtures skipped because a team is absent from the historical model. */
  skipped: Fixture[]
}

/**
 * Run each fixture through the model and surface the favoured selection in each
 * market. Fixtures with a team the model has never seen are skipped (and
 * reported) rather than guessed at.
 */
export function buildBoard(model: FittedModel, fixtures: Fixture[]): Board {
  const analyses = new Map<string, FixtureAnalysis>()
  const candidates: Candidate[] = []
  const skipped: Fixture[] = []

  for (const f of fixtures) {
    const neutral = Boolean(f.neutral)
    const lam = lambdasFor(model, f.home, f.away, neutral)
    if (!lam) {
      skipped.push(f)
      continue
    }
    const sm = scoreMatrix(lam.lh, lam.la, model.rho)
    const x = outcomeProbs(sm)
    const ou = overUnder(sm, TOTAL_LINE)
    const btts = bttsProbs(sm)
    const top = mostLikelyScore(sm)
    // Extra full-time markets SG Pools offers, read off the same score matrix.
    const oe = oddEvenProbs(sm)
    // Default AH line ≈ the expected goal supremacy, to the nearest 0.25.
    const hcapDefault = Math.max(-2, Math.min(2, Math.round(-(lam.lh - lam.la) * 4) / 4))
    const id = fixtureId(f)
    const a: FixtureAnalysis = {
      fixtureId: id,
      date: f.date,
      home: f.home,
      away: f.away,
      neutral,
      lh: lam.lh,
      la: lam.la,
      rho: model.rho,
      x,
      ou,
      btts,
      top,
      oe: { odd: oe.odd, even: oe.even },
      hcapDefault,
    }
    analyses.set(id, a)

    // 1X2 — surface the model's favoured outcome.
    const sides = [
      { sel: f.home, p: x.home },
      { sel: 'Draw', p: x.draw },
      { sel: f.away, p: x.away },
    ].sort((m, n) => n.p - m.p)
    candidates.push(mkCandidate(a, '1X2', 'Match Result (1X2)', sides[0].sel, sides[0].p))

    // Totals — favoured side of the 2.5 line.
    if (ou.over >= ou.under) {
      candidates.push(mkCandidate(a, 'Total', `Total Goals O/U ${TOTAL_LINE}`, `Over ${TOTAL_LINE}`, ou.over))
    } else {
      candidates.push(mkCandidate(a, 'Total', `Total Goals O/U ${TOTAL_LINE}`, `Under ${TOTAL_LINE}`, ou.under))
    }

    // Both teams to score — favoured side.
    if (btts.yes >= btts.no) {
      candidates.push(mkCandidate(a, 'BTTS', 'Both Teams to Score', 'BTTS: Yes', btts.yes))
    } else {
      candidates.push(mkCandidate(a, 'BTTS', 'Both Teams to Score', 'BTTS: No', btts.no))
    }
  }

  return { analyses, candidates, skipped }
}

// ---------------------------------------------------------------------------
// Pricing a candidate against a book line
// ---------------------------------------------------------------------------

export function tierByEdge(edge: number): Tier {
  if (edge >= 0.05) return 'High'
  if (edge >= 0.02) return 'Medium'
  if (edge >= 0) return 'Low'
  return 'Pass'
}

/**
 * Attach a book price to a candidate and derive edge/EV/tier. A missing or
 * invalid price returns the candidate in its unpriced state.
 */
export function priceCandidate(c: Candidate, bookOdds: number | undefined): Candidate {
  if (!bookOdds || !Number.isFinite(bookOdds) || bookOdds <= 1) {
    return { ...c, bookOdds: undefined, edge: undefined, ev: undefined, tier: 'Unpriced' }
  }
  const edge = c.modelProb - impliedProb(bookOdds)
  const ev = expectedValue(c.modelProb, bookOdds)
  return { ...c, bookOdds, edge, ev, tier: tierByEdge(edge) }
}

// FNV-1a string hash → [0, 1). Used only to fabricate *illustrative* book
// prices for the demo toggle; deterministic so the board is stable across
// renders and never reaches for the (blocked) Math.random.
function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

/**
 * A plausible-but-fake book price: the fair odds nudged ±~11% so the board has a
 * realistic spread of +EV and −EV rows to demonstrate the workflow. Clearly
 * labelled in the UI — replace with a real SG Pools price for a true edge.
 */
export function illustrativeOdds(c: Candidate): number {
  return illustrativeFromFair(c.fixtureId + '|' + c.selection, c.fairOdds)
}

/** Illustrative book price from a fair price + a stable seed. */
export function illustrativeFromFair(seed: string, fairOdds: number): number {
  if (!Number.isFinite(fairOdds)) return 0
  const factor = 0.9 + hash01(seed) * 0.22
  return Math.max(1.05, Math.round(fairOdds * factor * 100) / 100)
}

// ---------------------------------------------------------------------------
// Per-fixture selections — every side of the three core markets, for the
// match-card view. The model already holds the full 1X2 / O/U / BTTS splits;
// this just turns them into individually priceable rows.
// ---------------------------------------------------------------------------

export type SelId = 'home' | 'draw' | 'away' | 'over' | 'under' | 'bttsYes' | 'bttsNo' | 'odd' | 'even'

export interface Selection {
  selId: SelId
  marketKind: MarketKind
  market: string
  label: string
  modelProb: number
  fairOdds: number
}

export interface PricedSelection extends Selection {
  bookOdds?: number
  edge?: number
  ev?: number
  tier: Tier
}

export function selectionKey(fixtureId: string, selId: SelId): string {
  return `${fixtureId}::${selId}`
}

// --- Asian handicap (variable line) -----------------------------------------

/** A priced side of the Asian handicap at the currently-selected line. */
export interface HcapRow {
  key: string
  label: string
  modelProb: number
  fairOdds: number
  bookOdds?: number
  edge?: number
  ev?: number
}

/** Standard AH lines from the home perspective, −2..+2 in 0.25 steps. */
export const HCAP_LINES: number[] = Array.from({ length: 17 }, (_, i) => (i - 8) / 4)

export function fmtLine(h: number): string {
  if (h === 0) return '0'
  return `${h > 0 ? '+' : '−'}${Math.abs(h)}`
}

export function hcapKey(fixtureId: string, side: 'home' | 'away', line: number): string {
  return `${fixtureId}::hcap::${side}::${line}`
}

export function fixtureSelections(a: FixtureAnalysis): Selection[] {
  const mk = (
    selId: SelId,
    marketKind: MarketKind,
    market: string,
    label: string,
    p: number,
  ): Selection => ({ selId, marketKind, market, label, modelProb: p, fairOdds: p > 0 ? 1 / p : Infinity })
  return [
    mk('home', '1X2', 'Match Result (1X2)', a.home, a.x.home),
    mk('draw', '1X2', 'Match Result (1X2)', 'Draw', a.x.draw),
    mk('away', '1X2', 'Match Result (1X2)', a.away, a.x.away),
    mk('over', 'Total', `Total Goals O/U ${TOTAL_LINE}`, `Over ${TOTAL_LINE}`, a.ou.over),
    mk('under', 'Total', `Total Goals O/U ${TOTAL_LINE}`, `Under ${TOTAL_LINE}`, a.ou.under),
    mk('bttsYes', 'BTTS', 'Both Teams to Score', 'BTTS: Yes', a.btts.yes),
    mk('bttsNo', 'BTTS', 'Both Teams to Score', 'BTTS: No', a.btts.no),
    // Odd/even (breakdown only). The Asian handicap is a separate, variable-line
    // market handled interactively in the breakdown, not a fixed selection here.
    mk('odd', 'OddEven', 'Total Goals Odd/Even', 'Odd total', a.oe.odd),
    mk('even', 'OddEven', 'Total Goals Odd/Even', 'Even total', a.oe.even),
  ]
}

export function priceSelection(s: Selection, bookOdds: number | undefined): PricedSelection {
  if (!bookOdds || !Number.isFinite(bookOdds) || bookOdds <= 1) {
    return { ...s, bookOdds: undefined, edge: undefined, ev: undefined, tier: 'Unpriced' }
  }
  const edge = s.modelProb - impliedProb(bookOdds)
  const ev = expectedValue(s.modelProb, bookOdds)
  return { ...s, bookOdds, edge, ev, tier: tierByEdge(edge) }
}

/** Price every selection of a fixture, taking book odds from the map (or fabricating illustrative ones). */
export function priceFixture(
  a: FixtureAnalysis,
  illustrative: boolean,
  bookOdds: Record<string, number>,
): PricedSelection[] {
  return fixtureSelections(a).map((s) => {
    const key = selectionKey(a.fixtureId, s.selId)
    const book = illustrative ? illustrativeFromFair(key, s.fairOdds) : bookOdds[key]
    return priceSelection(s, book)
  })
}

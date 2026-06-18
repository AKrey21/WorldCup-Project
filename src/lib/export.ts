// Dataset export — the whole point of the data-collection run.
//
// The lab's end-goal is to walk away with a clean picks-vs-odds dataset to
// backtest against. CSV is for a spreadsheet / pandas; JSON is a full state dump
// you can re-import or archive. Everything runs in the browser — no upload.

import type { AppState, Pick } from '../types'
import { pickProfit } from './settlement'
import { clvOf } from './clv'

function csvCell(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const CSV_HEADERS = [
  'pickId',
  'capturedAt',
  'settledAt',
  'matchDate',
  'home',
  'away',
  'stage',
  'market',
  'selection',
  'odds',
  'impliedProb',
  'myProb',
  'stake',
  'result',
  'profit',
  'closingOdds',
  'clvPct',
] as const

/** Flatten every pick (with its match + derived fields) into one CSV. */
export function picksToCsv(state: AppState): string {
  const matchById = new Map(state.matches.map((m) => [m.id, m]))
  const rows = state.picks.map((p: Pick) => {
    const m = matchById.get(p.matchId)
    return [
      p.id,
      p.capturedAt,
      p.settledAt ?? '',
      m?.dateUTC ?? '',
      m?.homeTeam ?? '',
      m?.awayTeam ?? '',
      m?.stage ?? '',
      p.market,
      p.selection,
      p.oddsDecimal,
      (1 / p.oddsDecimal).toFixed(4),
      p.estProb ?? '',
      p.stake,
      p.result,
      pickProfit(p).toFixed(2),
      p.closingOdds ?? '',
      p.closingOdds !== undefined ? (clvOf(p.oddsDecimal, p.closingOdds)?.pct.toFixed(4) ?? '') : '',
    ]
      .map(csvCell)
      .join(',')
  })
  return [CSV_HEADERS.join(','), ...rows].join('\n')
}

/** Full state dump — picks, matches and bankroll ledger — for archive / re-import. */
export function stateToJson(state: AppState): string {
  return JSON.stringify(state, null, 2)
}

/** Trigger a client-side file download with no server round-trip. */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Date-stamped filename like `wcpp-picks-2026-06-18.csv`. */
export function exportFilename(ext: string, today = new Date()): string {
  return `wcpp-picks-${today.toISOString().slice(0, 10)}.${ext}`
}

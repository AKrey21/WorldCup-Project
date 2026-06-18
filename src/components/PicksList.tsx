import { useState } from 'react'
import { useAppState, useDispatch } from '../state/store'
import type { Match, Pick, PickResult } from '../types'
import {
  isAHMarket,
  parseHandicap,
  partsToResult,
  pickProfit,
  settleAH,
} from '../lib/settlement'
import { fmtDateTime, fmtMoney, fmtSignedMoney } from '../lib/format'
import { downloadFile, exportFilename, picksToCsv, stateToJson } from '../lib/export'
import { clvOf, clvSummary } from '../lib/clv'
import { EVBadge } from './EVBadge'

/** Enter the market's closing odds for a pick and show the resulting CLV. */
function ClvControl({ pick }: { pick: Pick }) {
  const dispatch = useDispatch()
  const [raw, setRaw] = useState(pick.closingOdds?.toString() ?? '')
  const clv = pick.closingOdds !== undefined ? clvOf(pick.oddsDecimal, pick.closingOdds) : null

  function commit(v: string) {
    setRaw(v)
    const n = parseFloat(v)
    dispatch({
      type: 'setClosingOdds',
      id: pick.id,
      closingOdds: v && Number.isFinite(n) && n > 1 ? n : undefined,
    })
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-xs text-neutral-500">Close</span>
      <input
        value={raw}
        onChange={(e) => commit(e.target.value)}
        inputMode="decimal"
        placeholder="@"
        aria-label="Closing odds"
        className="w-14 rounded-md border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-right text-xs tabular-nums text-neutral-100 placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
      />
      {clv && (
        <span
          className={`text-xs font-medium tabular-nums ${clv.beat ? 'text-emerald-400' : 'text-red-400'}`}
          title={clv.beat ? 'You beat the closing line' : 'You took a worse price than the close'}
        >
          {clv.pct >= 0 ? '+' : ''}
          {(clv.pct * 100).toFixed(1)}% CLV
        </span>
      )}
    </span>
  )
}

const RESULT_LABEL: Record<PickResult, string> = {
  pending: 'Pending',
  win: 'Win',
  'half-win': '½ Win',
  push: 'Push',
  'half-loss': '½ Loss',
  loss: 'Loss',
  void: 'Void',
}

function resultChipCls(result: PickResult): string {
  switch (result) {
    case 'win':
    case 'half-win':
      return 'bg-emerald-500/15 text-emerald-300'
    case 'loss':
    case 'half-loss':
      return 'bg-red-500/15 text-red-300'
    default:
      return 'bg-neutral-800 text-neutral-300'
  }
}

function fixtureOf(match: Match | undefined): string {
  return match ? `${match.homeTeam} vs ${match.awayTeam}` : 'Unknown match'
}

function ScoreSettle({ pick, onSettle }: { pick: Pick; onSettle: (r: PickResult) => void }) {
  const handicap = parseHandicap(pick.selection)
  const [backed, setBacked] = useState('')
  const [opp, setOpp] = useState('')
  if (handicap === null) return null

  const b = parseInt(backed, 10)
  const o = parseInt(opp, 10)
  const ready = Number.isInteger(b) && Number.isInteger(o) && b >= 0 && o >= 0
  const inputCls =
    'w-14 rounded-md border border-neutral-700 bg-neutral-800 text-neutral-100 placeholder-neutral-500 px-2 py-1 text-center text-sm focus:border-neutral-500 focus:outline-none'

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
      <span>
        Or settle from score ({handicap > 0 ? '+' : ''}
        {handicap}):
      </span>
      <input
        className={inputCls}
        inputMode="numeric"
        placeholder="Us"
        value={backed}
        onChange={(e) => setBacked(e.target.value)}
        aria-label="Backed team goals"
      />
      <span>–</span>
      <input
        className={inputCls}
        inputMode="numeric"
        placeholder="Them"
        value={opp}
        onChange={(e) => setOpp(e.target.value)}
        aria-label="Opponent goals"
      />
      <button
        type="button"
        disabled={!ready}
        onClick={() => onSettle(partsToResult(settleAH(b, o, handicap)))}
        className="rounded-md border border-neutral-700 px-2 py-1 font-medium disabled:opacity-40"
      >
        Settle from score
      </button>
    </div>
  )
}

function PendingPick({ pick, match }: { pick: Pick; match: Match | undefined }) {
  const dispatch = useDispatch()
  const settle = (result: PickResult) => dispatch({ type: 'settlePick', id: pick.id, result })
  const ahLike = isAHMarket(pick.market) || parseHandicap(pick.selection) !== null

  const simple: PickResult[] = ['win', 'loss', 'void']
  const complex: PickResult[] = ['half-win', 'push', 'half-loss']
  const btnCls = 'rounded-md border border-neutral-700 px-2.5 py-1 text-xs font-medium'

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-1">
        <div>
          <span className="text-sm font-semibold">{fixtureOf(match)}</span>
          <span className="ml-2 text-xs text-neutral-500">{match?.stage}</span>
        </div>
        <span className="text-xs text-neutral-500">grabbed {fmtDateTime(pick.capturedAt)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-neutral-400">{pick.market}:</span>
        <span className="font-medium">{pick.selection}</span>
        <span className="tabular-nums">@{pick.oddsDecimal.toFixed(2)}</span>
        <span className="tabular-nums text-neutral-500">{fmtMoney(pick.stake)} stake</span>
        <span className="text-neutral-500">
          implied {(100 / pick.oddsDecimal).toFixed(1)}%
          {pick.estProb !== undefined && ` · mine ${(pick.estProb * 100).toFixed(0)}%`}
        </span>
        <EVBadge estProb={pick.estProb} odds={pick.oddsDecimal} />
        <ClvControl pick={pick} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {simple.map((r) => (
          <button key={r} type="button" onClick={() => settle(r)} className={btnCls}>
            {RESULT_LABEL[r]}
          </button>
        ))}
        {ahLike &&
          complex.map((r) => (
            <button key={r} type="button" onClick={() => settle(r)} className={btnCls}>
              {RESULT_LABEL[r]}
            </button>
          ))}
        <button
          type="button"
          onClick={() => dispatch({ type: 'deletePick', id: pick.id })}
          className="ml-auto rounded-md px-2.5 py-1 text-xs font-medium text-red-400"
        >
          Delete
        </button>
      </div>
      {ahLike && <ScoreSettle pick={pick} onSettle={settle} />}
    </div>
  )
}

export function PicksList() {
  const state = useAppState()
  const dispatch = useDispatch()
  const matchById = new Map(state.matches.map((m) => [m.id, m]))

  const pending = state.picks.filter((p) => p.result === 'pending')
  const settled = state.picks
    .filter((p) => p.result !== 'pending')
    .sort((a, b) => (b.settledAt ?? '').localeCompare(a.settledAt ?? ''))

  const hasPicks = state.picks.length > 0
  const clv = clvSummary(state.picks)
  const exportBtn =
    'rounded-md border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-800'

  return (
    <section className="space-y-4">
      {clv.n > 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Closing Line Value
            </span>
            <span className="text-[11px] text-neutral-500">
              on {clv.n} pick{clv.n === 1 ? '' : 's'} with a closing price
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span
              className={`text-2xl font-bold tabular-nums ${clv.avgPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {clv.avgPct >= 0 ? '+' : ''}
              {(clv.avgPct * 100).toFixed(1)}%
            </span>
            <span className="text-sm text-neutral-300">
              avg CLV · beat the close on{' '}
              <span className="font-semibold text-neutral-100">
                {clv.beat}/{clv.n}
              </span>{' '}
              ({(clv.beatRate * 100).toFixed(0)}%)
            </span>
            <span className="text-[11px] text-neutral-500">
              the realest signal of an edge — consistently positive CLV beats win/loss as proof.
            </span>
          </div>
        </div>
      )}

      {hasPicks && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2.5">
          <span className="text-xs text-neutral-400">
            Export your picks-vs-odds dataset ({state.picks.length} pick
            {state.picks.length === 1 ? '' : 's'}):
          </span>
          <button
            type="button"
            className={exportBtn}
            onClick={() =>
              downloadFile(exportFilename('csv'), picksToCsv(state), 'text/csv;charset=utf-8')
            }
          >
            Download CSV
          </button>
          <button
            type="button"
            className={exportBtn}
            onClick={() =>
              downloadFile(exportFilename('json'), stateToJson(state), 'application/json')
            }
          >
            Download JSON
          </button>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-base font-semibold">
          Pending picks{pending.length > 0 && ` (${pending.length})`}
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-500">
            No open picks. Paste an odds block or log one manually.
          </p>
        ) : (
          <div className="space-y-2">
            {pending.map((p) => (
              <PendingPick key={p.id} pick={p} match={matchById.get(p.matchId)} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-base font-semibold">
          History{settled.length > 0 && ` (${settled.length})`}
        </h2>
        {settled.length === 0 ? (
          <p className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-500">
            Nothing settled yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-3 py-2 font-medium">Pick</th>
                  <th className="px-3 py-2 font-medium">Odds</th>
                  <th className="px-3 py-2 font-medium">Stake</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 text-right font-medium">P/L</th>
                  <th className="px-3 py-2 font-medium">CLV</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {settled.map((p) => {
                  const profit = pickProfit(p)
                  return (
                    <tr key={p.id} className="border-b border-neutral-800 last:border-b-0">
                      <td className="px-3 py-2">
                        <div className="font-medium">{p.selection}</div>
                        <div className="text-xs text-neutral-500">
                          {fixtureOf(matchById.get(p.matchId))} · {p.market}
                        </div>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{p.oddsDecimal.toFixed(2)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmtMoney(p.stake)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${resultChipCls(p.result)}`}
                        >
                          {RESULT_LABEL[p.result]}
                        </span>
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-medium tabular-nums ${
                          profit > 0 ? 'text-emerald-400' : profit < 0 ? 'text-red-400' : 'text-neutral-500'
                        }`}
                      >
                        {fmtSignedMoney(profit)}
                      </td>
                      <td className="px-3 py-2">
                        <ClvControl pick={p} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => dispatch({ type: 'reopenPick', id: p.id })}
                          className="text-xs font-medium text-neutral-500"
                        >
                          Undo
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

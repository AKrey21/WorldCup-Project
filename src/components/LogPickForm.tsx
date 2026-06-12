import { useEffect, useState } from 'react'
import { useAppState, useDispatch } from '../state/store'
import { computeStats } from '../lib/stats'
import { impliedProb, expectedValue } from '../lib/ev'
import { fmtMoney, fmtTime, isStale, minutesAgo } from '../lib/format'
import { EVBadge } from './EVBadge'

export interface PickDraft {
  fixture: string
  kickoffISO: string | null
  market: string
  selection: string
  odds: number
  capturedAt: string
}

const STAGES = [
  'Group',
  'Round of 32',
  'Round of 16',
  'Quarter-final',
  'Semi-final',
  'Third place',
  'Final',
]

const MARKET_SUGGESTIONS = [
  '1X2',
  'Total Goals Over/Under 2.5',
  'Both Teams to Score',
  'Total Goals Odd/Even',
  '1/2 Goal',
  '1 1/2 Goal',
]

export function LogPickForm({ prefill }: { prefill: PickDraft | null }) {
  const state = useAppState()
  const dispatch = useDispatch()
  const stats = computeStats(state)
  const available = stats.balance - stats.openStake

  const [fixture, setFixture] = useState('')
  const [stage, setStage] = useState('Group')
  const [market, setMarket] = useState('')
  const [selection, setSelection] = useState('')
  const [odds, setOdds] = useState('')
  const [stake, setStake] = useState('1')
  const [estProb, setEstProb] = useState('')
  const [kickoffISO, setKickoffISO] = useState<string | null>(null)
  const [capturedAt, setCapturedAt] = useState(() => new Date().toISOString())
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Re-evaluate snapshot staleness every 30s.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  // Apply a fresh prefill from the paste-import during render.
  const [appliedPrefill, setAppliedPrefill] = useState<PickDraft | null>(null)
  if (prefill && prefill !== appliedPrefill) {
    setAppliedPrefill(prefill)
    setFixture(prefill.fixture)
    setMarket(prefill.market)
    setSelection(prefill.selection)
    setOdds(String(prefill.odds))
    setKickoffISO(prefill.kickoffISO)
    setCapturedAt(prefill.capturedAt)
    setError(null)
    setSaved(false)
  }

  const oddsNum = parseFloat(odds)
  const stakeNum = parseFloat(stake)
  const probNum = estProb === '' ? undefined : parseFloat(estProb) / 100
  const oddsValid = Number.isFinite(oddsNum) && oddsNum > 1
  const stale = isStale(capturedAt, now)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaved(false)
    const vsMatch = fixture.match(/^(.+?)\s+vs\s+(.+)$/i)
    if (!vsMatch) return setError('Match must look like "Portugal vs Nigeria".')
    if (!market.trim()) return setError('Market is required.')
    if (!selection.trim()) return setError('Selection is required.')
    if (!oddsValid) return setError('Odds must be decimal and greater than 1.00.')
    if (!Number.isFinite(stakeNum) || stakeNum <= 0) return setError('Stake must be positive.')
    if (stakeNum > available)
      return setError(
        `Stake exceeds available bankroll (${fmtMoney(available)}). One pot, hard cap.`,
      )
    if (probNum !== undefined && (probNum <= 0 || probNum >= 1))
      return setError('Estimated probability must be between 1 and 99 (%).')

    dispatch({
      type: 'addPick',
      input: {
        homeTeam: vsMatch[1],
        awayTeam: vsMatch[2],
        stage,
        dateUTC: kickoffISO,
        market: market.trim(),
        selection: selection.trim(),
        oddsDecimal: oddsNum,
        stake: stakeNum,
        estProb: probNum,
        capturedAt,
      },
    })
    setSelection('')
    setOdds('')
    setEstProb('')
    setError(null)
    setSaved(true)
  }

  const inputCls =
    'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none'
  const labelCls = 'mb-1 block text-xs font-medium text-neutral-600'

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Log a pick</h2>
        <span className="text-xs text-neutral-500">
          Available {fmtMoney(available)} · small flat units ($1–2)
        </span>
      </div>

      {stale && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span>
            Odds snapshot is {minutesAgo(capturedAt, now)} min old — re-grab from SG Pools before
            committing. Odds move.
          </span>
          <button
            type="button"
            onClick={() => setCapturedAt(new Date().toISOString())}
            className="shrink-0 rounded-md border border-amber-400 px-2 py-1 font-medium"
          >
            Re-stamp to now
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls}>Match</label>
          <input
            className={inputCls}
            placeholder="Portugal vs Nigeria"
            value={fixture}
            onChange={(e) => setFixture(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Stage</label>
          <select className={inputCls} value={stage} onChange={(e) => setStage(e.target.value)}>
            {STAGES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Market</label>
          <input
            className={inputCls}
            list="market-suggestions"
            placeholder="1X2"
            value={market}
            onChange={(e) => setMarket(e.target.value)}
          />
          <datalist id="market-suggestions">
            {MARKET_SUGGESTIONS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
        <div>
          <label className={labelCls}>Selection</label>
          <input
            className={inputCls}
            placeholder="Portugal"
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>SG Pools decimal odds</label>
          <input
            className={inputCls}
            type="number"
            step="0.01"
            min="1.01"
            inputMode="decimal"
            placeholder="1.85"
            value={odds}
            onChange={(e) => setOdds(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Stake ($, paper)</label>
          <input
            className={inputCls}
            type="number"
            step="0.5"
            min="0.5"
            inputMode="decimal"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>My estimated probability (%, optional)</label>
          <input
            className={inputCls}
            type="number"
            step="1"
            min="1"
            max="99"
            inputMode="numeric"
            placeholder="e.g. 55"
            value={estProb}
            onChange={(e) => setEstProb(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600">
        <span>
          Odds grabbed <span className="font-medium">{fmtTime(capturedAt)}</span>
          {minutesAgo(capturedAt, now) > 0 && ` (${minutesAgo(capturedAt, now)} min ago)`}
        </span>
        {oddsValid && (
          <span>
            Implied <span className="font-medium">{(impliedProb(oddsNum) * 100).toFixed(1)}%</span>
          </span>
        )}
        {oddsValid && probNum !== undefined && probNum > 0 && probNum < 1 && (
          <>
            <span>
              EV/$1{' '}
              <span className="font-medium">{expectedValue(probNum, oddsNum).toFixed(3)}</span>
            </span>
            <EVBadge estProb={probNum} odds={oddsNum} />
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-green-700">Pick logged.</p>}

      <button
        type="submit"
        className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white sm:w-auto"
      >
        Log pick
      </button>
      <p className="text-[11px] leading-snug text-neutral-400">
        Only bet where you think the price is wrong — skipping is a move. No chase staking, ever.
      </p>
    </form>
  )
}

import { useMemo, useState } from 'react'
import {
  CORE_MARKETS,
  fmtLine,
  hcapKey,
  priceFixture,
  selectionKey,
  type FixtureAnalysis,
  type HcapRow,
  type MarketKind,
  type PricedSelection,
} from '../lib/bestbets'
import { asianHandicap, asianHandicapEv, scoreMatrix } from '../lib/model/dixon-coles'
import { describeError, getStoredKey } from '../lib/ai/anthropic'
import { matchVerdict, type Verdict, type VerdictInput } from '../lib/ai/verdict'
import type { PickDraft } from './LogPickForm'
import { MatchDetail } from './MatchDetail'

type MarketFilter = 'all' | MarketKind

const MARKETS: { kind: MarketKind; title: string }[] = [
  { kind: '1X2', title: 'Match result' },
  { kind: 'Total', title: 'Total goals 2.5' },
  { kind: 'BTTS', title: 'Both teams to score' },
]

function pct(x: number, dp = 0): string {
  return `${(x * 100).toFixed(dp)}%`
}

function signedPct(x: number, dp = 1): string {
  return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(dp)}%`
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T18:00:00Z`).toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function VerdictChip({ verdict }: { verdict: Verdict['verdict'] }) {
  const map: Record<Verdict['verdict'], { cls: string; label: string }> = {
    bet: { cls: 'bg-emerald-500/15 text-emerald-300', label: 'BET' },
    lean: { cls: 'bg-amber-500/15 text-amber-300', label: 'LEAN' },
    pass: { cls: 'bg-neutral-800 text-neutral-400', label: 'NO BET' },
  }
  const { cls, label } = map[verdict]
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide ${cls}`}>
      {label}
    </span>
  )
}

function SelectionRow({
  p,
  fixtureId,
  illustrative,
  bookOdds,
  onOdds,
  onLog,
}: {
  p: PricedSelection
  fixtureId: string
  illustrative: boolean
  bookOdds: Record<string, number>
  onOdds: (key: string, raw: string) => void
  onLog: () => void
}) {
  const key = selectionKey(fixtureId, p.selId)
  const edgeCls =
    p.edge === undefined ? 'text-neutral-600' : p.edge >= 0 ? 'text-emerald-400' : 'text-red-400'
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onLog}
        title="Log this pick"
        className="group flex min-w-0 flex-1 items-center justify-between gap-2 rounded px-1.5 py-1 text-left hover:bg-neutral-800/60"
      >
        <span className="min-w-0">
          <span className="block truncate text-xs text-neutral-200">{p.label}</span>
          <span className="block text-[10px] text-neutral-500">
            fair {Number.isFinite(p.fairOdds) ? p.fairOdds.toFixed(2) : '—'}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs">
          <span className="font-semibold tabular-nums text-neutral-100">{pct(p.modelProb)}</span>
          <span className={`w-11 text-right tabular-nums ${edgeCls}`}>
            {p.edge === undefined ? '—' : signedPct(p.edge)}
          </span>
        </span>
      </button>
      {illustrative ? (
        <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-neutral-300">
          {p.bookOdds?.toFixed(2)}
        </span>
      ) : (
        <input
          type="number"
          step="0.01"
          min="1.01"
          inputMode="decimal"
          value={bookOdds[key] ?? ''}
          onChange={(e) => onOdds(key, e.target.value)}
          placeholder="—"
          className="w-14 shrink-0 rounded-md border border-neutral-700 bg-neutral-800 px-1.5 py-1 text-right text-xs tabular-nums text-neutral-100 placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
        />
      )}
    </div>
  )
}

export function MatchCard({
  a,
  market,
  illustrative,
  bookOdds,
  hcapLine,
  onHcapLine,
  open,
  onToggle,
  onOdds,
  onLog,
}: {
  a: FixtureAnalysis
  market: MarketFilter
  illustrative: boolean
  bookOdds: Record<string, number>
  hcapLine: number
  onHcapLine: (line: number) => void
  open: boolean
  onToggle: () => void
  onOdds: (key: string, raw: string) => void
  onLog: (draft: PickDraft) => void
}) {
  const priced = useMemo(
    () => priceFixture(a, illustrative, bookOdds),
    [a, illustrative, bookOdds],
  )

  // Asian handicap — variable line (persisted by the parent) to match SG Pools.
  const sm = useMemo(() => scoreMatrix(a.lh, a.la, a.rho), [a.lh, a.la, a.rho])
  const hcapRows = useMemo<HcapRow[]>(() => {
    const ah = asianHandicap(sm, hcapLine)
    const make = (
      side: 'home' | 'away',
      s: typeof ah.home,
      label: string,
    ): HcapRow => {
      const key = hcapKey(a.fixtureId, side, hcapLine)
      const book = illustrative ? undefined : bookOdds[key]
      const valid = book !== undefined && Number.isFinite(book) && book > 1
      return {
        key,
        label,
        modelProb: s.prob,
        fairOdds: s.fairOdds,
        bookOdds: valid ? book : undefined,
        edge: valid ? s.prob - 1 / book! : undefined,
        ev: valid ? asianHandicapEv(s, book!) : undefined,
      }
    }
    return [
      make('home', ah.home, `${a.home} ${fmtLine(hcapLine)}`),
      make('away', ah.away, `${a.away} ${fmtLine(-hcapLine)}`),
    ]
  }, [sm, hcapLine, illustrative, bookOdds, a.fixtureId, a.home, a.away])

  // AI verdict state. Available once real (non-demo) book prices are entered.
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [vBusy, setVBusy] = useState(false)
  const [vError, setVError] = useState<string | null>(null)
  const pricedHcap = hcapRows.filter((r) => r.bookOdds !== undefined)
  const hasRealPrice =
    !illustrative && (priced.some((p) => p.bookOdds !== undefined) || pricedHcap.length > 0)

  // Invalidate a stale verdict whenever this match's prices (incl. handicap) change.
  const bookSig =
    priced.map((p) => p.bookOdds ?? '').join(',') +
    '|' +
    hcapRows.map((r) => r.bookOdds ?? '').join(',')
  const [prevSig, setPrevSig] = useState(bookSig)
  if (prevSig !== bookSig) {
    setPrevSig(bookSig)
    setVerdict(null)
    setVError(null)
  }

  async function runVerdict() {
    const apiKey = getStoredKey()
    if (!apiKey) {
      setVError('Add your Anthropic API key first — use the “API key” button in the header.')
      return
    }
    setVBusy(true)
    setVError(null)
    try {
      const input: VerdictInput = {
        home: a.home,
        away: a.away,
        homeXg: a.lh,
        awayXg: a.la,
        selections: [...priced, ...pricedHcap].map((p) => ({
          label: p.label,
          modelProb: p.modelProb,
          fairOdds: p.fairOdds,
          bookOdds: p.bookOdds,
          edgePct: p.edge === undefined ? undefined : p.edge * 100,
          evPer1: p.ev,
        })),
      }
      setVerdict(await matchVerdict(input, apiKey))
    } catch (err) {
      setVError(describeError(err))
    } finally {
      setVBusy(false)
    }
  }

  const evPriced = priced.filter((p) => p.ev !== undefined)
  const bestBet = evPriced.length
    ? evPriced.reduce((x, y) => (y.ev! > x.ev! ? y : x))
    : undefined
  const showBest = bestBet !== undefined && bestBet.ev! >= 0
  // "Top" hint stays on the core markets — a 1X2/Totals/BTTS pick, not a trivially
  // high-probability double chance.
  const core = priced.filter((p) => CORE_MARKETS.includes(p.marketKind))
  const topPick = core.reduce((x, y) => (y.modelProb > x.modelProb ? y : x))

  function draftFor(p: PricedSelection): PickDraft {
    return {
      fixture: `${a.home} vs ${a.away}`,
      kickoffISO: `${a.date}T18:00:00.000Z`,
      market: p.market,
      selection: p.label,
      odds: Math.round((p.bookOdds ?? p.fairOdds) * 100) / 100,
      capturedAt: new Date().toISOString(),
      estProbPct: Math.round(p.modelProb * 100),
      stage: 'Group',
    }
  }

  const blocks = MARKETS.filter((m) => market === 'all' || m.kind === market)

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 px-4 pt-3 text-left"
      >
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
            {fmtDate(a.date)}
          </div>
          <div className="mt-0.5 text-sm font-bold leading-snug text-neutral-100">{a.home}</div>
          <div className="text-sm font-bold leading-snug text-neutral-100">{a.away}</div>
          <div className="mt-0.5 text-[10px] text-neutral-500">Neutral venue · Group</div>
        </div>
        <div className="flex items-center gap-3">
          {showBest ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onLog(draftFor(bestBet!))
              }}
              className="rounded-md bg-emerald-500/15 px-2 py-1 text-right text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25"
              title="Log the best bet"
            >
              <span className="block">Best: {bestBet!.label}</span>
              <span className="block tabular-nums">{signedPct(bestBet!.edge!)} edge</span>
            </button>
          ) : (
            <span className="rounded-md bg-neutral-800 px-2 py-1 text-right text-[11px] text-neutral-400">
              <span className="block">Top: {topPick.label}</span>
              <span className="block tabular-nums">{pct(topPick.modelProb)}</span>
            </span>
          )}
          <span
            className={`text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          >
            ⌄
          </span>
        </div>
      </button>

      <div className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
        {blocks.map((blk) => (
          <div key={blk.kind}>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              {blk.title}
            </div>
            <div className="space-y-0.5">
              {priced
                .filter((p) => p.marketKind === blk.kind)
                .map((p) => (
                  <SelectionRow
                    key={p.selId}
                    p={p}
                    fixtureId={a.fixtureId}
                    illustrative={illustrative}
                    bookOdds={bookOdds}
                    onOdds={onOdds}
                    onLog={() => onLog(draftFor(p))}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>

      {hasRealPrice && (
        <div className="border-t border-neutral-800 px-4 py-3">
          {!verdict && (
            <button
              type="button"
              onClick={runVerdict}
              disabled={vBusy}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-600/50 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
            >
              {vBusy && (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-700 border-t-emerald-300" />
              )}
              <span className="inline-flex items-center gap-1">
                <span className="rounded bg-emerald-500/15 px-1 text-[9px] font-bold uppercase tracking-wider">
                  AI
                </span>
                {vBusy ? 'Reading the odds…' : 'Verdict on these odds'}
              </span>
            </button>
          )}

          {vError && <p className="text-xs text-red-400">{vError}</p>}

          {verdict && (
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <VerdictChip verdict={verdict.verdict} />
                <span className="text-sm font-semibold text-neutral-100">{verdict.pick}</span>
                <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                  {verdict.confidence} confidence
                </span>
                <button
                  type="button"
                  onClick={runVerdict}
                  disabled={vBusy}
                  className="ml-auto text-[11px] font-medium text-neutral-500 hover:text-neutral-300 disabled:opacity-50"
                >
                  {vBusy ? 'Re-running…' : 'Re-run'}
                </button>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-300">{verdict.rationale}</p>
              <p className="mt-1 text-[10px] text-neutral-600">
                Model-based opinion for paper trading — not financial advice.
              </p>
            </div>
          )}
        </div>
      )}

      {open && (
        <MatchDetail
          a={a}
          priced={priced}
          illustrative={illustrative}
          bookOdds={bookOdds}
          onOdds={onOdds}
          hcapLine={hcapLine}
          onHcapLine={onHcapLine}
          hcapRows={hcapRows}
        />
      )}
    </div>
  )
}

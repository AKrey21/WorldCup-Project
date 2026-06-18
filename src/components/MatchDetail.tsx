import { useMemo } from 'react'
import { scoreMatrix, totalGoalsDistribution } from '../lib/model/dixon-coles'
import {
  fmtLine,
  HCAP_LINES,
  selectionKey,
  type FixtureAnalysis,
  type HcapRow,
  type MarketKind,
  type PricedSelection,
  TOTAL_LINE,
} from '../lib/bestbets'

function pct(x: number, dp = 0): string {
  return `${(x * 100).toFixed(dp)}%`
}

function signedPct(x: number, dp = 1): string {
  return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(dp)}%`
}

const EXTRA_MARKETS: { kind: MarketKind; title: string }[] = [
  { kind: 'OddEven', title: 'Goals odd / even' },
]

// Goals shown on each axis of the scoreline heatmap (0..GRID).
const GRID = 5
// Bars shown in the totals histogram; the last one lumps the tail.
const CHART_MAX = 7

function heatStyle(p: number, max: number): React.CSSProperties {
  const a = max > 0 ? 0.1 + 0.9 * (p / max) : 0
  return { backgroundColor: `rgba(16, 185, 129, ${a.toFixed(3)})` }
}

function Scorelines({ m }: { m: number[][] }) {
  // Most probable cell within the shown 0..GRID block sets the colour scale.
  let max = 0
  for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++) max = Math.max(max, m[i][j])
  const rows = Array.from({ length: GRID + 1 }, (_, r) => GRID - r) // home goals high → low
  const cols = Array.from({ length: GRID + 1 }, (_, c) => c) // away goals low → high

  return (
    <div className="flex gap-1.5">
      <div className="flex items-center">
        <span className="text-[9px] uppercase tracking-wider text-neutral-500 [writing-mode:vertical-rl] rotate-180">
          Home goals
        </span>
      </div>
      <div className="flex-1">
        <div
          className="grid gap-0.5"
          style={{ gridTemplateColumns: `auto repeat(${GRID + 1}, minmax(0, 1fr))` }}
        >
          {rows.map((i) => (
            <Row key={i} i={i} cols={cols} m={m} max={max} />
          ))}
          {/* bottom axis */}
          <div />
          {cols.map((j) => (
            <div key={j} className="text-center text-[9px] text-neutral-500">
              {j}
            </div>
          ))}
        </div>
        <div className="mt-1 text-center text-[9px] uppercase tracking-wider text-neutral-500">
          Away goals
        </div>
      </div>
    </div>
  )
}

function Row({ i, cols, m, max }: { i: number; cols: number[]; m: number[][]; max: number }) {
  return (
    <>
      <div className="flex items-center justify-end pr-1 text-[9px] text-neutral-500">{i}</div>
      {cols.map((j) => {
        const p = m[i][j]
        const strong = max > 0 && p / max > 0.18
        return (
          <div
            key={j}
            style={heatStyle(p, max)}
            className={`flex aspect-square items-center justify-center rounded-sm text-[10px] font-semibold tabular-nums ${
              strong ? 'text-white' : 'text-neutral-500'
            }`}
            title={`${i}-${j}: ${pct(p, 1)}`}
          >
            {Math.round(p * 100)}
          </div>
        )
      })}
    </>
  )
}

function GoalsDistribution({ dist }: { dist: number[] }) {
  // Bars 0..CHART_MAX-1 individually; the last bar lumps CHART_MAX+ together.
  const bars: { k: number; label: string; p: number; over: boolean }[] = []
  for (let k = 0; k < CHART_MAX; k++) {
    bars.push({ k, label: String(k), p: dist[k] ?? 0, over: k >= 3 })
  }
  let tail = 0
  for (let k = CHART_MAX; k < dist.length; k++) tail += dist[k]
  bars.push({ k: CHART_MAX, label: `${CHART_MAX}+`, p: tail, over: true })
  const max = Math.max(...bars.map((b) => b.p), 0.0001)

  return (
    <div>
      <div className="flex h-32 items-end gap-1.5">
        {bars.map((b) => (
          <div key={b.k} className="flex flex-1 flex-col items-center justify-end">
            <span className="mb-1 text-[10px] font-semibold tabular-nums text-neutral-300">
              {Math.round(b.p * 100)}
            </span>
            <div
              className={`w-full rounded-t-sm ${b.over ? 'bg-emerald-500' : 'bg-neutral-600'}`}
              style={{ height: `${Math.max(2, (b.p / max) * 100)}%` }}
            />
            <span className="mt-1 text-[10px] text-neutral-500">{b.label}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-neutral-500">
        <span className="text-emerald-400">green</span> = 3+ goals (Over {TOTAL_LINE} region)
      </p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
        {title}
      </div>
      {children}
    </div>
  )
}

function MarketRow({ label, p }: { label: string; p: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-xs">
      <span className="text-neutral-400">{label}</span>
      <span className="tabular-nums text-neutral-200">
        {pct(p)} <span className="text-neutral-500">· {p > 0 ? (1 / p).toFixed(2) : '—'}</span>
      </span>
    </div>
  )
}

function PricedRow({
  p,
  fixtureId,
  illustrative,
  bookOdds,
  onOdds,
}: {
  p: PricedSelection
  fixtureId: string
  illustrative: boolean
  bookOdds: Record<string, number>
  onOdds: (key: string, raw: string) => void
}) {
  const key = selectionKey(fixtureId, p.selId)
  const edgeCls =
    p.edge === undefined ? 'text-neutral-600' : p.edge >= 0 ? 'text-emerald-400' : 'text-red-400'
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-xs">
      <span className="min-w-0 flex-1 truncate text-neutral-300">{p.label}</span>
      <span className="w-9 shrink-0 text-right font-semibold tabular-nums text-neutral-200">
        {pct(p.modelProb)}
      </span>
      <span className="w-10 shrink-0 text-right tabular-nums text-neutral-500">
        {Number.isFinite(p.fairOdds) ? p.fairOdds.toFixed(2) : '—'}
      </span>
      {illustrative ? (
        <span className="w-12 shrink-0 text-right tabular-nums text-neutral-300">
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
          className="w-12 shrink-0 rounded-md border border-neutral-700 bg-neutral-800 px-1 py-0.5 text-right text-[11px] tabular-nums text-neutral-100 placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
        />
      )}
      <span className={`w-11 shrink-0 text-right tabular-nums ${edgeCls}`}>
        {p.edge === undefined ? '—' : signedPct(p.edge)}
      </span>
    </div>
  )
}

function HandicapPanel({
  rows,
  line,
  onLine,
  illustrative,
  bookOdds,
  onOdds,
}: {
  rows: HcapRow[]
  line: number
  onLine: (line: number) => void
  illustrative: boolean
  bookOdds: Record<string, number>
  onOdds: (key: string, raw: string) => void
}) {
  return (
    <Panel title="Asian handicap (occasional)">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[10px] text-neutral-500">Line</span>
        <select
          value={line}
          onChange={(e) => onLine(parseFloat(e.target.value))}
          className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-xs text-neutral-100 focus:border-neutral-500 focus:outline-none"
        >
          {HCAP_LINES.map((h) => (
            <option key={h} value={h}>
              {fmtLine(h)}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-neutral-600">match the line SG Pools shows</span>
      </div>
      {rows.map((r) => {
        const edgeCls =
          r.edge === undefined ? 'text-neutral-600' : r.edge >= 0 ? 'text-emerald-400' : 'text-red-400'
        return (
          <div key={r.key} className="flex items-center gap-1.5 py-0.5 text-xs">
            <span className="min-w-0 flex-1 truncate text-neutral-300">{r.label}</span>
            <span className="w-9 shrink-0 text-right font-semibold tabular-nums text-neutral-200">
              {pct(r.modelProb)}
            </span>
            <span className="w-10 shrink-0 text-right tabular-nums text-neutral-500">
              {Number.isFinite(r.fairOdds) ? r.fairOdds.toFixed(2) : '—'}
            </span>
            {illustrative ? (
              <span className="w-12 shrink-0 text-right tabular-nums text-neutral-600">—</span>
            ) : (
              <input
                type="number"
                step="0.01"
                min="1.01"
                inputMode="decimal"
                value={bookOdds[r.key] ?? ''}
                onChange={(e) => onOdds(r.key, e.target.value)}
                placeholder="—"
                className="w-12 shrink-0 rounded-md border border-neutral-700 bg-neutral-800 px-1 py-0.5 text-right text-[11px] tabular-nums text-neutral-100 placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
              />
            )}
            <span className={`w-11 shrink-0 text-right tabular-nums ${edgeCls}`}>
              {r.edge === undefined ? '—' : signedPct(r.edge)}
            </span>
          </div>
        )
      })}
    </Panel>
  )
}

export function MatchDetail({
  a,
  priced,
  illustrative,
  bookOdds,
  onOdds,
  hcapLine,
  onHcapLine,
  hcapRows,
}: {
  a: FixtureAnalysis
  priced: PricedSelection[]
  illustrative: boolean
  bookOdds: Record<string, number>
  onOdds: (key: string, raw: string) => void
  hcapLine: number
  onHcapLine: (line: number) => void
  hcapRows: HcapRow[]
}) {
  const sm = useMemo(() => scoreMatrix(a.lh, a.la, a.rho), [a.lh, a.la, a.rho])
  const dist = useMemo(() => totalGoalsDistribution(sm), [sm])

  return (
    <div className="border-t border-neutral-800 bg-neutral-900 px-4 py-4 text-neutral-100">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Most likely scorelines">
          <Scorelines m={sm.m} />
        </Panel>

        <Panel title="Total goals distribution">
          <GoalsDistribution dist={dist} />
        </Panel>

        <div className="space-y-4">
          <Panel title="Model expected goals">
            <div className="space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-neutral-300">{a.home}</span>
                <span className="text-2xl font-bold tabular-nums">{a.lh.toFixed(2)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-neutral-300">{a.away}</span>
                <span className="text-2xl font-bold tabular-nums">{a.la.toFixed(2)}</span>
              </div>
            </div>
          </Panel>

          <Panel title="1X2 win probability">
            <MarketRow label={a.home} p={a.x.home} />
            <MarketRow label="Draw" p={a.x.draw} />
            <MarketRow label={a.away} p={a.x.away} />
          </Panel>
        </div>
      </div>

      {/* Extra priceable markets — all from the same scoreline matrix. */}
      <div className="mt-5 border-t border-neutral-800 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            More markets
          </span>
          <span className="text-[10px] text-neutral-600">model% · fair · book · edge</span>
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          <HandicapPanel
            rows={hcapRows}
            line={hcapLine}
            onLine={onHcapLine}
            illustrative={illustrative}
            bookOdds={bookOdds}
            onOdds={onOdds}
          />
          {EXTRA_MARKETS.map((m) => {
            const rows = priced.filter((p) => p.marketKind === m.kind)
            if (rows.length === 0) return null
            return (
              <Panel key={m.kind} title={m.title}>
                {rows.map((p) => (
                  <PricedRow
                    key={p.selId}
                    p={p}
                    fixtureId={a.fixtureId}
                    illustrative={illustrative}
                    bookOdds={bookOdds}
                    onOdds={onOdds}
                  />
                ))}
              </Panel>
            )
          })}
        </div>
      </div>

      <p className="mt-3 text-[10px] text-neutral-500">
        Add a book price to any selection to see its edge. Halftime, half-time/full-time, first
        goalscorer and which-half markets are not shown — they need an in-game model the full-time
        scoreline matrix can’t produce.
      </p>
    </div>
  )
}

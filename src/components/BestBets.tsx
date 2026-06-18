import { useEffect, useMemo, useState } from 'react'
import {
  buildBoard,
  fixtureSelections,
  getModel,
  loadFixtures,
  modelReady,
  priceFixture,
  selectionKey,
  type MarketKind,
} from '../lib/bestbets'
import type { FittedModel } from '../lib/model/fit'
import { useLocalStorage } from '../lib/useLocalStorage'
import type { PickDraft } from './LogPickForm'
import { OddsImportAI } from './OddsImportAI'
import { PickOfDay } from './PickOfDay'
import { MatchCard } from './MatchCard'
import type { OddsItem, OddsMatch } from '../lib/ai/parseOdds'

type MarketFilter = 'all' | MarketKind
type SortKey = 'date' | 'ev' | 'edge' | 'prob'

const TODAY = new Date().toISOString().slice(0, 10)

const MARKET_FILTERS: { key: MarketFilter; label: string }[] = [
  { key: 'all', label: 'All markets' },
  { key: '1X2', label: 'Match result' },
  { key: 'Total', label: 'Totals' },
  { key: 'BTTS', label: 'BTTS' },
]

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'date', label: 'Kick-off date' },
  { key: 'ev', label: 'Best EV' },
  { key: 'edge', label: 'Best edge' },
  { key: 'prob', label: 'Top probability' },
]

export function BestBets({ onLogToLab }: { onLogToLab: (draft: PickDraft) => void }) {
  const [model, setModel] = useState<FittedModel | null>(() => (modelReady() ? getModel() : null))
  const [market, setMarket] = useLocalStorage<MarketFilter>('wcpp-market', 'all')
  const [sort, setSort] = useLocalStorage<SortKey>('wcpp-sort', 'date')
  const [search, setSearch] = useState('')
  const [illustrative, setIllustrative] = useState(false)
  const [upcomingOnly, setUpcomingOnly] = useLocalStorage('wcpp-upcoming-only', true)
  // The entered book odds and chosen handicap lines persist across restarts.
  const [bookOdds, setBookOdds] = useLocalStorage<Record<string, number>>('wcpp-book-odds', {})
  const [hcapLines, setHcapLines] = useLocalStorage<Record<string, number>>('wcpp-hcap-lines', {})
  const [expanded, setExpanded] = useState<string | null>(null)

  // Fit the model after first paint so the spinner shows rather than blocking it.
  useEffect(() => {
    if (model) return
    let cancelled = false
    const t = setTimeout(() => {
      const m = getModel()
      if (!cancelled) setModel(m)
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [model])

  const board = useMemo(() => {
    if (!model) return null
    const fixtures = loadFixtures()
      .filter((f) => !upcomingOnly || f.date >= TODAY)
      .sort((a, b) => a.date.localeCompare(b.date))
    return buildBoard(model, fixtures)
  }, [model, upcomingOnly])

  // One entry per fixture, each pre-priced, then filtered and sorted.
  const cards = useMemo(() => {
    if (!board) return []
    const q = search.trim().toLowerCase()
    const list = [...board.analyses.values()]
      .filter((a) => !q || `${a.home} ${a.away}`.toLowerCase().includes(q))
      .map((a) => {
        const priced = priceFixture(a, illustrative, bookOdds)
        const evs = priced.map((p) => p.ev).filter((x): x is number => x !== undefined)
        const edges = priced.map((p) => p.edge).filter((x): x is number => x !== undefined)
        return {
          a,
          priced,
          bestEv: evs.length ? Math.max(...evs) : -Infinity,
          bestEdge: edges.length ? Math.max(...edges) : -Infinity,
          bestProb: Math.max(...priced.map((p) => p.modelProb)),
        }
      })
    list.sort((x, y) => {
      switch (sort) {
        case 'ev':
          return y.bestEv - x.bestEv || x.a.date.localeCompare(y.a.date)
        case 'edge':
          return y.bestEdge - x.bestEdge || x.a.date.localeCompare(y.a.date)
        case 'prob':
          return y.bestProb - x.bestProb
        case 'date':
        default:
          return x.a.date.localeCompare(y.a.date) || y.bestProb - x.bestProb
      }
    })
    return list
  }, [board, search, illustrative, bookOdds, sort])

  // All selections across the slate, for the AI importer to match against.
  const aiItems = useMemo<OddsItem[]>(() => {
    if (!board) return []
    const items: OddsItem[] = []
    for (const a of board.analyses.values())
      for (const s of fixtureSelections(a))
        items.push({
          key: selectionKey(a.fixtureId, s.selId),
          home: a.home,
          away: a.away,
          market: s.market,
          selection: s.label,
        })
    return items
  }, [board])

  const allPriced = cards.flatMap((c) => c.priced)
  const pricedCount = allPriced.filter((p) => p.bookOdds !== undefined).length
  const evCount = allPriced.filter((p) => (p.ev ?? -1) >= 0).length

  function setOdds(key: string, raw: string) {
    const v = parseFloat(raw)
    setBookOdds((prev) => {
      const next = { ...prev }
      if (!raw || !Number.isFinite(v)) delete next[key]
      else next[key] = v
      return next
    })
  }

  function applyAiMatches(matches: OddsMatch[]) {
    if (matches.length === 0) return
    setIllustrative(false)
    setBookOdds((prev) => {
      const next = { ...prev }
      for (const m of matches) next[m.key] = m.bookOdds
      return next
    })
  }

  return (
    <section className="space-y-5">
      {/* Hero / model header */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-900 text-white">
        <div className="px-5 py-6 sm:px-7 sm:py-7">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-200">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-300" />
            World Cup 2026 · Free beta
          </div>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Model Best Bets</h2>
          <p className="mt-1 max-w-2xl text-sm text-emerald-100">
            Every fixture run through a Dixon-Coles scoreline model fit on real international
            results. Each match shows the model's probability and fair price for every side of the
            core markets — drop in real book lines to surface the edge.
          </p>
          {model && (
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-emerald-100">
              <span>
                Fit on <span className="font-semibold text-white">{model.teams.length}</span> teams
              </span>
              <span>
                Home edge{' '}
                <span className="font-semibold text-white">×{Math.exp(model.gamma).toFixed(2)}</span>{' '}
                goals
              </span>
              <span>
                Low-score ρ <span className="font-semibold text-white">{model.rho.toFixed(3)}</span>
              </span>
              <span>
                As of <span className="font-semibold text-white">{model.asOf}</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {!model || !board ? (
        <div className="flex items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 px-5 py-8 text-sm text-neutral-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-300" />
          Fitting the Dixon-Coles model over ~11,900 international matches…
        </div>
      ) : (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Summary label="Matches" value={String(cards.length)} />
            <Summary label="Selections" value={String(allPriced.length)} />
            <Summary
              label="Priced"
              value={illustrative ? `${allPriced.length} (demo)` : String(pricedCount)}
            />
            <Summary
              label="+EV found"
              value={pricedCount || illustrative ? String(evCount) : '—'}
              tone={evCount > 0 && (pricedCount || illustrative) ? 'up' : undefined}
            />
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {MARKET_FILTERS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMarket(m.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    market === m.key
                      ? 'bg-emerald-600 text-white'
                      : 'border border-neutral-700 bg-neutral-900 text-neutral-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search team…"
              className="ml-auto w-40 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-100 placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  Sort: {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-neutral-400">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={upcomingOnly}
                onChange={(e) => setUpcomingOnly(e.target.checked)}
              />
              Upcoming only (from {TODAY})
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={illustrative}
                onChange={(e) => setIllustrative(e.target.checked)}
              />
              Illustrative book prices
            </label>
            {illustrative && (
              <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-amber-300">
                Demo prices — replace with real SG Pools odds for a true edge.
              </span>
            )}
          </div>

          <PickOfDay
            analyses={[...board.analyses.values()]}
            illustrative={illustrative}
            bookOdds={bookOdds}
          />

          <OddsImportAI items={aiItems} onApply={applyAiMatches} />

          {/* Match cards */}
          <div className="space-y-3">
            {cards.length === 0 && (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-8 text-center text-sm text-neutral-500">
                No matches. Clear the search or untick “Upcoming only”.
              </div>
            )}
            {cards.map(({ a }) => (
              <MatchCard
                key={a.fixtureId}
                a={a}
                market={market}
                illustrative={illustrative}
                bookOdds={bookOdds}
                hcapLine={hcapLines[a.fixtureId] ?? a.hcapDefault}
                onHcapLine={(line) => setHcapLines((prev) => ({ ...prev, [a.fixtureId]: line }))}
                open={expanded === a.fixtureId}
                onToggle={() => setExpanded(expanded === a.fixtureId ? null : a.fixtureId)}
                onOdds={setOdds}
                onLog={onLogToLab}
              />
            ))}
          </div>

          <p className="text-[11px] leading-snug text-neutral-500">
            Click any selection to log it to <span className="font-medium text-neutral-300">My Lab</span> with the model
            probability prefilled. Fair odds = 1 ÷ model probability and carry no margin — a bet is
            only +EV when the book price clears it. Open a card for the scoreline heatmap, goals
            distribution and expected goals.
          </p>
        </>
      )}
    </section>
  )
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: 'up' }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div
        className={`mt-1 text-lg font-semibold tabular-nums ${
          tone === 'up' ? 'text-emerald-400' : 'text-neutral-100'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

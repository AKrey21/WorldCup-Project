import { useMemo, useState } from 'react'
import { CORE_MARKETS, priceFixture, type FixtureAnalysis } from '../lib/bestbets'
import { describeError } from '../lib/ai/anthropic'
import { useApiKey } from '../lib/ai/useApiKey'
import {
  pickOfDay,
  researchDay,
  type DayPick,
  type PickMatch,
  type PickOfDayResult,
} from '../lib/ai/pickOfDay'

function fmtDay(iso: string): string {
  return new Date(`${iso}T18:00:00Z`).toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })
}

/** Build the model summary the AI ranks, keeping the three core markets. */
function toPickMatch(
  a: FixtureAnalysis,
  illustrative: boolean,
  bookOdds: Record<string, number>,
): PickMatch {
  const priced = priceFixture(a, illustrative, bookOdds).filter((p) =>
    CORE_MARKETS.includes(p.marketKind),
  )
  return {
    home: a.home,
    away: a.away,
    homeXg: a.lh,
    awayXg: a.la,
    selections: priced.map((p) => ({
      label: p.label,
      modelProb: p.modelProb,
      fairOdds: p.fairOdds,
      bookOdds: p.bookOdds,
      edgePct: p.edge === undefined ? undefined : p.edge * 100,
      evPer1: p.ev,
    })),
  }
}

const STANCE: Record<DayPick['stance'], { cls: string; label: string }> = {
  bet: { cls: 'bg-emerald-500/15 text-emerald-300', label: 'BET' },
  lean: { cls: 'bg-amber-500/15 text-amber-300', label: 'LEAN' },
  pass: { cls: 'bg-neutral-800 text-neutral-400', label: 'PASS' },
}

export function PickOfDay({
  analyses,
  illustrative,
  bookOdds,
}: {
  analyses: FixtureAnalysis[]
  illustrative: boolean
  bookOdds: Record<string, number>
}) {
  const apiKey = useApiKey()
  const [open, setOpen] = useState(false)
  const [useWeb, setUseWeb] = useState(true)
  const [busy, setBusy] = useState<false | 'research' | 'pick'>(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PickOfDayResult | null>(null)

  // Distinct fixture dates, earliest first, with a sensible default.
  const days = useMemo(() => {
    const set = new Set(analyses.map((a) => a.date))
    return [...set].sort((x, y) => x.localeCompare(y))
  }, [analyses])
  const [day, setDay] = useState('')
  const selectedDay = day && days.includes(day) ? day : days[0]

  const dayMatches = useMemo(
    () => analyses.filter((a) => a.date === selectedDay).sort((a, b) => a.home.localeCompare(b.home)),
    [analyses, selectedDay],
  )

  async function run() {
    if (!apiKey || dayMatches.length === 0) return
    setError(null)
    setResult(null)
    const matches = dayMatches.map((a) => toPickMatch(a, illustrative, bookOdds))
    try {
      let brief = ''
      let sources: PickOfDayResult['sources'] = []
      if (useWeb) {
        setBusy('research')
        const research = await researchDay(selectedDay, matches, apiKey)
        brief = research.brief
        sources = research.sources
      }
      setBusy('pick')
      const r = await pickOfDay({ date: selectedDay, matches, brief, sources }, apiKey)
      setResult(r)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  if (days.length === 0) return null

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="inline-flex items-center rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-300">
            AI
          </span>
          Pick of the Day
        </span>
        <span className="text-xs text-neutral-500">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-neutral-800 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedDay}
              onChange={(e) => setDay(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
            >
              {days.map((d) => (
                <option key={d} value={d}>
                  {fmtDay(d)}
                </option>
              ))}
            </select>
            <span className="text-xs text-neutral-500">
              {dayMatches.length} match{dayMatches.length === 1 ? '' : 'es'}
            </span>
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-neutral-400">
              <input type="checkbox" checked={useWeb} onChange={(e) => setUseWeb(e.target.checked)} />
              Web research (injuries, line-ups, form)
            </label>
          </div>

          {useWeb && (
            <p className="rounded-md border border-sky-500/30 bg-sky-500/5 px-2.5 py-1.5 text-[11px] leading-snug text-sky-200/90">
              Claude searches the web server-side for news on these fixtures and folds it into the
              read. This uses the web-search add-on and costs more per run than a plain pick.
            </p>
          )}

          {!apiKey ? (
            <p className="text-xs text-amber-300">
              Add your Anthropic API key (the “API key” button in the header) to use this.
            </p>
          ) : (
            <button
              type="button"
              onClick={run}
              disabled={Boolean(busy) || dayMatches.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
            >
              {busy && (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-200 border-t-white" />
              )}
              {busy === 'research'
                ? 'Researching the web…'
                : busy === 'pick'
                  ? 'Picking the day…'
                  : 'Generate pick of the day'}
            </button>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          {result && <ResultView result={result} />}
        </div>
      )}
    </div>
  )
}

function StakeDots({ units }: { units: number }) {
  return (
    <span className="inline-flex gap-0.5" title={`${units} unit${units === 1 ? '' : 's'}`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i <= units ? 'bg-emerald-400' : 'bg-neutral-700'}`}
        />
      ))}
    </span>
  )
}

function ResultView({ result }: { result: PickOfDayResult }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-gradient-to-br from-sky-800/60 to-sky-950/60 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">
          Top pick
        </div>
        <div className="mt-0.5 text-sm font-bold text-white">{result.topPick}</div>
        {result.dayNarrative && (
          <p className="mt-1 text-xs leading-relaxed text-sky-100/90">{result.dayNarrative}</p>
        )}
      </div>

      {result.picks.length > 0 ? (
        <ol className="space-y-2">
          {result.picks.map((p, i) => (
            <li key={i} className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${STANCE[p.stance].cls}`}
                >
                  {STANCE[p.stance].label}
                </span>
                <span className="text-sm font-semibold text-neutral-100">{p.selection}</span>
                <span className="text-xs text-neutral-500">{p.matchup}</span>
                <span className="ml-auto flex items-center gap-2">
                  <StakeDots units={p.stakeUnits} />
                  <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                    {p.confidence}
                  </span>
                </span>
              </div>
              {p.market && <div className="mt-0.5 text-[11px] text-neutral-500">{p.market}</div>}
              <p className="mt-1 text-xs leading-relaxed text-neutral-300">{p.rationale}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-neutral-500">No qualifying bet on this slate.</p>
      )}

      {result.researched && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-800/40 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Sources
          </div>
          {result.sources.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {result.sources.slice(0, 8).map((s, i) => (
                <li key={i} className="truncate text-[11px]">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-400 hover:underline"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[11px] text-neutral-500">
              No specific sources cited — the read is model-only for this slate.
            </p>
          )}
        </div>
      )}

      <p className="text-[10px] leading-snug text-neutral-600">
        AI opinion for paper trading, not financial advice. News adjusts the model read; it does not
        replace it.
      </p>
    </div>
  )
}

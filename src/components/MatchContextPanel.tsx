import { useState } from 'react'
import { describeError } from '../lib/ai/anthropic'
import { useApiKey } from '../lib/ai/useApiKey'
import { matchContext, type MatchContextResult } from '../lib/ai/matchContext'

/**
 * On-demand AI news & context brief for a fixture — injuries, line-ups, form,
 * motivation, conditions — fetched with the server-side web_search tool. Purely
 * informational: the thing the goals model can't see, for YOUR judgement. Opt-in
 * (your own key), since it uses the billable web-search add-on.
 */
export function MatchContextPanel({ home, away }: { home: string; away: string }) {
  const apiKey = useApiKey()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MatchContextResult | null>(null)

  async function run() {
    if (!apiKey) return
    setBusy(true)
    setError(null)
    try {
      setResult(await matchContext(home, away, apiKey))
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-t border-neutral-800 px-4 py-3">
      {!result && !busy &&
        (!apiKey ? (
          <p className="text-xs text-amber-300">
            Add your Anthropic API key (the “API key” button in the header) for an AI news &amp;
            context brief.
          </p>
        ) : (
          <button
            type="button"
            onClick={run}
            className="inline-flex items-center gap-2 rounded-lg border border-sky-600/50 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/10"
          >
            <span className="rounded bg-sky-500/15 px-1 text-[9px] font-bold uppercase tracking-wider">
              AI
            </span>
            Match context — injuries, line-ups, form
          </button>
        ))}

      {busy && (
        <span className="inline-flex items-center gap-2 text-xs text-neutral-400">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-700 border-t-sky-300" />
          Searching the web for team news…
        </span>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {result && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">
              Match context · web
            </span>
            <button
              type="button"
              onClick={run}
              disabled={busy}
              className="text-[10px] text-neutral-500 hover:text-neutral-300 disabled:opacity-40"
            >
              Refresh
            </button>
          </div>
          {result.brief ? (
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-300">
              {result.brief}
            </p>
          ) : (
            <p className="text-xs text-neutral-500">No notable news found for this fixture.</p>
          )}
          {result.sources.length > 0 && (
            <ul className="space-y-0.5">
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
          )}
          <p className="text-[10px] leading-snug text-neutral-600">
            Informational only — context the goals model can't see. Not a model input, not betting
            advice.
          </p>
        </div>
      )}
    </div>
  )
}

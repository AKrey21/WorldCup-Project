import { useState } from 'react'
import { parseOdds, kickoffToISO, type ParsedMatch } from '../lib/parser'
import { fmtTime } from '../lib/format'
import type { PickDraft } from './LogPickForm'

export function PasteImport({ onUseSelection }: { onUseSelection: (draft: PickDraft) => void }) {
  const [raw, setRaw] = useState('')
  const [parsed, setParsed] = useState<ParsedMatch[] | null>(null)

  function parse() {
    setParsed(parseOdds(raw))
  }

  const withMarkets = parsed?.filter((m) => m.markets.length > 0) ?? []

  return (
    <section className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
      <div>
        <h2 className="text-base font-semibold">Paste SG Pools odds</h2>
        <p className="mt-1 text-xs leading-snug text-neutral-500">
          Copy the odds block straight off the SG Pools page and paste it here — never scrape.
          Copy the fixtures list for all 1X2s at once, or a match page for all its markets.
          Pre-match lines only; what you paste is a point-in-time snapshot.
        </p>
      </div>
      <textarea
        className="h-36 w-full rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-100 placeholder-neutral-500 px-3 py-2 font-mono text-xs focus:border-neutral-500 focus:outline-none"
        placeholder={'5764Portugal vs Nigeria\nThu, 12 Jun 2026, 9.00pm\n011X2\n011.28Portugal\n025.50Draw\n0310.00Nigeria'}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      <button
        type="button"
        onClick={parse}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
      >
        Parse
      </button>

      {parsed !== null && withMarkets.length === 0 && (
        <p className="text-sm text-neutral-500">
          Nothing parsed — check the paste includes selection rows like{' '}
          <code className="rounded bg-neutral-800 px-1">011.28Portugal</code>.
        </p>
      )}

      {withMarkets.map((m) => (
        <div key={m.id} className="rounded-xl border border-neutral-800">
          <div className="flex flex-wrap items-baseline justify-between gap-1 border-b border-neutral-800 px-3 py-2">
            <span className="text-sm font-semibold">{m.fixture}</span>
            <span className="text-xs text-neutral-500">
              {m.kickoff ? `${m.kickoff} · ` : ''}grabbed {fmtTime(m.capturedAt)}
            </span>
          </div>
          {m.markets.map((mkt) => (
            <div key={mkt.code + mkt.name} className="border-b border-neutral-800 px-3 py-2 last:border-b-0">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                {mkt.name}
              </div>
              <div className="flex flex-wrap gap-2">
                {mkt.selections.map((sel) => (
                  <button
                    key={sel.code + sel.label}
                    type="button"
                    onClick={() =>
                      onUseSelection({
                        fixture: m.fixture,
                        kickoffISO: kickoffToISO(m.kickoff),
                        market: mkt.name,
                        selection: sel.label,
                        odds: sel.odds,
                        capturedAt: m.capturedAt,
                      })
                    }
                    className="rounded-lg border border-neutral-700 px-2.5 py-1.5 text-left text-xs"
                  >
                    <span className="font-medium">{sel.label}</span>{' '}
                    <span className="tabular-nums">@{sel.odds.toFixed(2)}</span>{' '}
                    <span className="text-neutral-500">({sel.impliedPct}%)</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  )
}

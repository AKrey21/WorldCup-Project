import { useState } from 'react'
import { describeError, getStoredKey, setStoredKey } from '../lib/ai/anthropic'
import { parseOddsWithAI, type OddsItem, type OddsMatch, type ParseResult } from '../lib/ai/parseOdds'

export function OddsImportAI({
  items,
  onApply,
}: {
  items: OddsItem[]
  onApply: (matches: OddsMatch[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [apiKey, setApiKey] = useState(() => getStoredKey())
  const [keyDraft, setKeyDraft] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ParseResult | null>(null)

  const hasKey = apiKey.length > 0

  function saveKey() {
    const k = keyDraft.trim()
    if (!k) return
    setStoredKey(k)
    setApiKey(k)
    setKeyDraft('')
    setError(null)
  }

  function forgetKey() {
    setStoredKey('')
    setApiKey('')
    setResult(null)
  }

  async function run() {
    if (!text.trim()) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await parseOddsWithAI(text, items, apiKey)
      setResult(res)
      onApply(res.matches)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
            AI
          </span>
          Auto-fill book odds from a paste
        </span>
        <span className="text-xs text-neutral-500">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-neutral-800 px-4 py-3">
          {!hasKey ? (
            <div className="space-y-2">
              <p className="text-xs text-neutral-400">
                Paste your Anthropic API key. It is stored only in this browser (localStorage) and
                sent directly to api.anthropic.com when you click Match — never to anyone else.
              </p>
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-200">
                ⚠ The key lives in your browser in plain text. On a public site (e.g. GitHub Pages)
                it shares an origin with your other pages there, so use a{' '}
                <span className="font-semibold">dedicated, spend-capped</span> key you can revoke —
                not your main one. The board works without a key; only the AI features need it.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  placeholder="sk-ant-…"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={saveKey}
                  disabled={!keyDraft.trim()}
                  className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                >
                  Save key
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>
                  Key saved (…{apiKey.slice(-4)}). Paste odds for any World Cup match in any format.
                </span>
                <button type="button" onClick={forgetKey} className="font-medium text-red-400">
                  Forget key
                </button>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                placeholder={'e.g.\nBRA v SRB  1X2  Brazil 1.55  Draw 4.10  Serbia 6.50\no2.5 1.90  BTTS 1.80'}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 font-mono text-xs text-neutral-100 placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={run}
                  disabled={busy || !text.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                >
                  {busy && (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-200 border-t-white" />
                  )}
                  {busy ? 'Matching…' : 'Match with AI'}
                </button>
                <span className="text-[11px] text-neutral-400">
                  Sends the pasted text + the {items.length} selections to Claude.
                </span>
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          {result && (
            <div className="space-y-2 rounded-lg bg-neutral-800/50 px-3 py-2 text-xs">
              <p className="font-medium text-emerald-300">
                Filled {result.matches.length} book price{result.matches.length === 1 ? '' : 's'}.
              </p>
              {result.matches.length === 0 && (
                <p className="text-neutral-500">
                  Nothing matched — the paste may only price sides the board doesn’t surface, or the
                  teams aren’t in this slate.
                </p>
              )}
              {result.unmatched.length > 0 && (
                <div>
                  <p className="mb-0.5 text-neutral-500">Couldn’t map:</p>
                  <ul className="list-inside list-disc text-neutral-500">
                    {result.unmatched.slice(0, 8).map((u, i) => (
                      <li key={i} className="truncate">
                        {u}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { setStoredKey } from '../lib/ai/anthropic'
import { useApiKey } from '../lib/ai/useApiKey'

/**
 * Header control for the Anthropic API key. Set it once here and every AI feature
 * (paste-import odds matcher, per-match verdict) picks it up. The key lives only
 * in this browser's localStorage and is sent straight to api.anthropic.com on the
 * actions that use it — never to any server of ours.
 */
export function ApiKeySettings() {
  const apiKey = useApiKey()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const hasKey = apiKey.length > 0

  function save() {
    const k = draft.trim()
    if (!k) return
    setStoredKey(k)
    setDraft('')
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
        title="Set your Anthropic API key for the AI features"
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${hasKey ? 'bg-emerald-400' : 'bg-neutral-600'}`}
          aria-hidden
        />
        API key
        {hasKey && <span className="text-neutral-500">…{apiKey.slice(-4)}</span>}
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 z-20 mt-2 w-80 space-y-2 rounded-xl border border-neutral-800 bg-neutral-900 p-3 shadow-xl">
            <p className="text-xs font-semibold text-neutral-200">Anthropic API key</p>
            <p className="text-[11px] leading-snug text-neutral-400">
              Powers the AI odds-matcher and per-match verdict. Stored only in this browser
              (localStorage) and sent directly to api.anthropic.com — never to anyone else. The board
              and tracker work fully without it.
            </p>
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-200">
              ⚠ On a public site (e.g. GitHub Pages) the key shares an origin with anything else
              hosted there, so use a <span className="font-semibold">dedicated, spend-capped</span>{' '}
              key you can revoke — not your main one.
            </p>

            {hasKey ? (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-neutral-800/60 px-3 py-2 text-xs">
                <span className="text-neutral-400">
                  Saved <span className="font-mono text-neutral-200">…{apiKey.slice(-4)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setStoredKey('')}
                  className="font-medium text-red-400 hover:text-red-300"
                >
                  Forget key
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="password"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                  placeholder="sk-ant-…"
                  autoComplete="off"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={save}
                  disabled={!draft.trim()}
                  className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            )}
            <p className="text-[10px] text-neutral-600">
              Get a key at console.anthropic.com → API Keys.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

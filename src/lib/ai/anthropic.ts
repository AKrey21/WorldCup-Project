// Browser-side Anthropic client wiring.
//
// This app has no backend, so the only way to call Claude is directly from the
// browser with the user's own API key (held in localStorage and sent straight
// to api.anthropic.com — never to us). Every call is user-initiated, so nothing
// leaves the machine unless the user clicks. `dangerouslyAllowBrowser` is the
// SDK's explicit acknowledgement of that single-user, bring-your-own-key model.

import Anthropic from '@anthropic-ai/sdk'

const KEY_STORAGE = 'wcpp-anthropic-key'

/** Default model for the odds parser. Opus 4.8 — strong enough to map messy,
 *  varied paste formats to the right fixtures without extended thinking. */
export const ODDS_PARSER_MODEL = 'claude-opus-4-8'

// A tiny pub/sub so every part of the UI that shows the key (the header field,
// the paste-import panel) reacts the moment it is saved or forgotten anywhere —
// no prop-drilling, and it also catches edits made in another browser tab.
const keyListeners = new Set<() => void>()

export function subscribeKey(cb: () => void): () => void {
  keyListeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY_STORAGE) cb()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    keyListeners.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

export function getStoredKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

export function setStoredKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key)
    else localStorage.removeItem(KEY_STORAGE)
  } catch {
    /* localStorage unavailable — nothing to persist */
  }
  keyListeners.forEach((l) => l())
}

export function makeClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

/** Turn an SDK/API error into a short, user-facing message. */
export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'Invalid API key — check it and try again.'
  if (err instanceof Anthropic.PermissionDeniedError) return 'This API key lacks access to the model.'
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited by the API — wait a moment and retry.'
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the API — check your connection.'
  if (err instanceof Anthropic.APIError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong.'
}

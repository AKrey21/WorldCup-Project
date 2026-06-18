import { useSyncExternalStore } from 'react'
import { getStoredKey, subscribeKey } from './anthropic'

/**
 * The stored Anthropic key as reactive state. Any component can read it, and all
 * of them update together when `setStoredKey` is called from anywhere (the header
 * settings field, the paste-import panel, or another tab).
 */
export function useApiKey(): string {
  return useSyncExternalStore(subscribeKey, getStoredKey, getStoredKey)
}

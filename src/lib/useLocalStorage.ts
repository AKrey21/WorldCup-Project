import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

/**
 * useState backed by localStorage. The value is read once on mount and written
 * back whenever it changes, so it survives a page reload / app restart.
 */
export function useLocalStorage<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage full or unavailable — nothing we can do */
    }
  }, [key, value])

  return [value, setValue]
}

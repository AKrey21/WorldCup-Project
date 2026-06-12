export function fmtMoney(x: number): string {
  const sign = x < 0 ? '-' : ''
  return `${sign}$${Math.abs(x).toFixed(2)}`
}

export function fmtSignedMoney(x: number): string {
  return x >= 0 ? `+${fmtMoney(x)}` : fmtMoney(x)
}

export function fmtPct(x: number, dp = 1): string {
  return `${x.toFixed(dp)}%`
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function minutesAgo(iso: string, now = Date.now()): number {
  return Math.floor((now - new Date(iso).getTime()) / 60000)
}

/** A snapshot older than this should be re-grabbed before committing a pick. */
export const STALE_MS = 5 * 60 * 1000

export function isStale(capturedAtISO: string, now = Date.now()): boolean {
  return now - new Date(capturedAtISO).getTime() > STALE_MS
}

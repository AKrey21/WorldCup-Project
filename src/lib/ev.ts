/** Book-implied probability from decimal odds (includes the house margin). */
export function impliedProb(odds: number): number {
  return 1 / odds
}

/** Expected value per $1 staked: EV = p·(odds−1) − (1−p). Positive = value. */
export function expectedValue(p: number, odds: number): number {
  return p * (odds - 1) - (1 - p)
}

export type EVFlag = '+EV' | '-EV' | null

export function evFlag(p: number | undefined, odds: number): EVFlag {
  if (p === undefined || p <= 0 || p >= 1 || odds <= 1) return null
  return expectedValue(p, odds) >= 0 ? '+EV' : '-EV'
}

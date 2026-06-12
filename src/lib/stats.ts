import type { AppState, Pick } from '../types'
import { isSettled, pickProfit } from './settlement'

export interface Stats {
  balance: number
  openStake: number
  totalStaked: number
  netProfit: number
  roiPct: number | null
  hitRatePct: number | null
  settledCount: number
  pendingCount: number
  biggestWin: number | null
  biggestLoss: number | null
  streak: { kind: 'W' | 'L'; length: number } | null
}

function settledByTime(picks: Pick[]): Pick[] {
  return picks
    .filter(isSettled)
    .slice()
    .sort((a, b) => (a.settledAt ?? '').localeCompare(b.settledAt ?? ''))
}

export function computeStats(state: AppState): Stats {
  const settled = settledByTime(state.picks)
  const pending = state.picks.filter((p) => p.result === 'pending')

  const netProfit = settled.reduce((sum, p) => sum + pickProfit(p), 0)
  const deposits = state.ledger.deposits.reduce((sum, d) => sum + d.amount, 0)
  const balance = state.ledger.startingBankroll + deposits + netProfit

  // Turnover excludes voids — a voided bet never went to market.
  const staked = settled.filter((p) => p.result !== 'void')
  const totalStaked = staked.reduce((sum, p) => sum + p.stake, 0)
  const openStake = pending.reduce((sum, p) => sum + p.stake, 0)

  const roiPct = totalStaked > 0 ? (netProfit / totalStaked) * 100 : null

  // Hit rate counts decided bets only: pushes and voids are neither hit nor miss.
  const decided = settled.filter((p) => p.result !== 'void' && p.result !== 'push')
  const hits = decided.filter((p) => p.result === 'win' || p.result === 'half-win')
  const hitRatePct = decided.length > 0 ? (hits.length / decided.length) * 100 : null

  const profits = settled.map(pickProfit)
  const wins = profits.filter((x) => x > 0)
  const losses = profits.filter((x) => x < 0)
  const biggestWin = wins.length ? Math.max(...wins) : null
  const biggestLoss = losses.length ? Math.min(...losses) : null

  let streak: Stats['streak'] = null
  for (let i = decided.length - 1; i >= 0; i--) {
    const kind: 'W' | 'L' =
      decided[i].result === 'win' || decided[i].result === 'half-win' ? 'W' : 'L'
    if (!streak) streak = { kind, length: 1 }
    else if (streak.kind === kind) streak.length++
    else break
  }

  return {
    balance,
    openStake,
    totalStaked,
    netProfit,
    roiPct,
    hitRatePct,
    settledCount: settled.length,
    pendingCount: pending.length,
    biggestWin,
    biggestLoss,
    streak,
  }
}

export interface EquityPoint {
  label: string
  balance: number
}

/** Balance after each settled pick, in settlement order, starting from the bankroll. */
export function equitySeries(state: AppState): EquityPoint[] {
  const deposits = state.ledger.deposits.reduce((sum, d) => sum + d.amount, 0)
  let balance = state.ledger.startingBankroll + deposits
  const points: EquityPoint[] = [{ label: 'Start', balance }]
  for (const pick of settledByTime(state.picks)) {
    balance += pickProfit(pick)
    points.push({ label: pick.selection, balance })
  }
  return points
}

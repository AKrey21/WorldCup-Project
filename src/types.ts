export type MatchStatus = 'upcoming' | 'settled'

export interface Match {
  id: string
  dateUTC: string | null
  stage: string
  homeTeam: string
  awayTeam: string
  status: MatchStatus
}

export type PickResult =
  | 'pending'
  | 'win'
  | 'half-win'
  | 'push'
  | 'half-loss'
  | 'loss'
  | 'void'

export interface Pick {
  id: string
  matchId: string
  market: string
  selection: string
  oddsDecimal: number
  stake: number
  /** User's own probability estimate, 0..1. Optional. */
  estProb?: number
  result: PickResult
  /** When the odds snapshot was grabbed off SG Pools (ISO). */
  capturedAt: string
  settledAt?: string
}

export interface Deposit {
  amount: number
  at: string
}

/** Balance is never stored — always derived from startingBankroll + settled picks. */
export interface Ledger {
  startingBankroll: number
  deposits: Deposit[]
}

export interface AppState {
  ledger: Ledger
  matches: Match[]
  picks: Pick[]
}

/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type ReactNode,
} from 'react'
import type { AppState, Pick, PickResult } from '../types'

const STORAGE_KEY = 'wcbl-state-v1'

const initialState: AppState = {
  ledger: { startingBankroll: 100, deposits: [] },
  matches: [],
  picks: [],
}

export interface NewPickInput {
  homeTeam: string
  awayTeam: string
  stage: string
  dateUTC: string | null
  market: string
  selection: string
  oddsDecimal: number
  stake: number
  estProb?: number
  capturedAt: string
}

export type Action =
  | { type: 'setBankroll'; amount: number }
  | { type: 'addPick'; input: NewPickInput }
  | { type: 'settlePick'; id: string; result: PickResult }
  | { type: 'reopenPick'; id: string }
  | { type: 'setClosingOdds'; id: string; closingOdds: number | undefined }
  | { type: 'deletePick'; id: string }
  | { type: 'resetAll' }

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function matchKey(home: string, away: string): string {
  return `${home.trim().toLowerCase()} vs ${away.trim().toLowerCase()}`
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'setBankroll':
      return {
        ...state,
        ledger: { ...state.ledger, startingBankroll: action.amount },
      }
    case 'addPick': {
      const { input } = action
      let match = state.matches.find(
        (m) => matchKey(m.homeTeam, m.awayTeam) === matchKey(input.homeTeam, input.awayTeam),
      )
      let matches = state.matches
      if (!match) {
        match = {
          id: newId('match'),
          dateUTC: input.dateUTC,
          stage: input.stage,
          homeTeam: input.homeTeam.trim(),
          awayTeam: input.awayTeam.trim(),
          status: 'upcoming',
        }
        matches = [...matches, match]
      }
      const pick: Pick = {
        id: newId('pick'),
        matchId: match.id,
        market: input.market,
        selection: input.selection,
        oddsDecimal: input.oddsDecimal,
        stake: input.stake,
        estProb: input.estProb,
        result: 'pending',
        capturedAt: input.capturedAt,
      }
      return { ...state, matches, picks: [...state.picks, pick] }
    }
    case 'settlePick':
      return {
        ...state,
        picks: state.picks.map((p) =>
          p.id === action.id
            ? { ...p, result: action.result, settledAt: new Date().toISOString() }
            : p,
        ),
      }
    case 'reopenPick':
      return {
        ...state,
        picks: state.picks.map((p) =>
          p.id === action.id ? { ...p, result: 'pending', settledAt: undefined } : p,
        ),
      }
    case 'setClosingOdds':
      return {
        ...state,
        picks: state.picks.map((p) =>
          p.id === action.id ? { ...p, closingOdds: action.closingOdds } : p,
        ),
      }
    case 'deletePick':
      return { ...state, picks: state.picks.filter((p) => p.id !== action.id) }
    case 'resetAll':
      return initialState
  }
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialState
    const parsed = JSON.parse(raw) as AppState
    if (
      typeof parsed?.ledger?.startingBankroll !== 'number' ||
      !Array.isArray(parsed.picks) ||
      !Array.isArray(parsed.matches)
    ) {
      return initialState
    }
    return {
      ...parsed,
      ledger: {
        ...parsed.ledger,
        deposits: Array.isArray(parsed.ledger.deposits) ? parsed.ledger.deposits : [],
      },
    }
  } catch {
    return initialState
  }
}

const StateContext = createContext<AppState>(initialState)
const DispatchContext = createContext<React.Dispatch<Action>>(() => {})

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  )
}

export function useAppState(): AppState {
  return useContext(StateContext)
}

export function useDispatch(): React.Dispatch<Action> {
  return useContext(DispatchContext)
}

import { useState } from 'react'
import { useAppState, useDispatch } from '../state/store'
import { fmtMoney } from '../lib/format'

export function BankrollCard() {
  const state = useAppState()
  const dispatch = useDispatch()
  const [value, setValue] = useState(String(state.ledger.startingBankroll))

  function save() {
    const amount = parseFloat(value)
    if (!Number.isFinite(amount) || amount <= 0) return
    dispatch({ type: 'setBankroll', amount })
  }

  function resetAll() {
    if (
      window.confirm(
        'Wipe all picks, matches and bankroll back to defaults? This cannot be undone.',
      )
    ) {
      dispatch({ type: 'resetAll' })
      setValue('100')
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-base font-semibold">Bankroll</h2>
      <p className="mt-1 text-xs leading-snug text-neutral-500">
        One recycling pot of paper money — a hard cap, not 104 parallel bets. Currently{' '}
        {fmtMoney(state.ledger.startingBankroll)} starting.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          className="w-32 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          type="number"
          min="1"
          step="1"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Starting bankroll"
        />
        <button
          type="button"
          onClick={save}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Set
        </button>
        <button
          type="button"
          onClick={resetAll}
          className="ml-auto rounded-lg px-3 py-2 text-sm font-medium text-red-600"
        >
          Reset all data
        </button>
      </div>
    </section>
  )
}

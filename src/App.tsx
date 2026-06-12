import { useRef, useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { LogPickForm, type PickDraft } from './components/LogPickForm'
import { PasteImport } from './components/PasteImport'
import { PicksList } from './components/PicksList'
import { BankrollCard } from './components/BankrollCard'

function App() {
  const [prefill, setPrefill] = useState<PickDraft | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  function useSelection(draft: PickDraft) {
    // Always a fresh object, so the form sees each click as a new prefill.
    setPrefill({ ...draft })
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-2xl font-bold tracking-tight">World Cup Betting Lab</h1>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-800">
            Paper trading
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Real SG Pools odds, fake money. One question: do I actually have an edge?
        </p>
      </header>

      <main className="space-y-6">
        <Dashboard />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div ref={formRef} className="scroll-mt-4">
            <LogPickForm prefill={prefill} />
          </div>
          <PasteImport onUseSelection={useSelection} />
        </div>

        <PicksList />
        <BankrollCard />
      </main>

      <footer className="mt-8 text-center text-[11px] text-neutral-400">
        Measurement tool, not a money machine. No staking system beats a negative-EV game.
      </footer>
    </div>
  )
}

export default App

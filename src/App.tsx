import { useRef, useState } from 'react'
import { BestBets } from './components/BestBets'
import { Dashboard } from './components/Dashboard'
import { LogPickForm, type PickDraft } from './components/LogPickForm'
import { PasteImport } from './components/PasteImport'
import { PicksList } from './components/PicksList'
import { BankrollCard } from './components/BankrollCard'

type Tab = 'bets' | 'lab'

function App() {
  const [tab, setTab] = useState<Tab>('bets')
  const [prefill, setPrefill] = useState<PickDraft | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  function scrollToForm() {
    // Wait a frame so the lab tab has rendered the form before scrolling.
    requestAnimationFrame(() =>
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }

  function useSelection(draft: PickDraft) {
    // Always a fresh object, so the form sees each click as a new prefill.
    setPrefill({ ...draft })
    scrollToForm()
  }

  function logFromBestBets(draft: PickDraft) {
    setPrefill({ ...draft })
    setTab('lab')
    scrollToForm()
  }

  const tabCls = (t: Tab) =>
    `rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
      tab === t ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:bg-neutral-800'
    }`

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-2xl font-bold tracking-tight">World Cup Prop Predictor</h1>
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
            Model + paper trading
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-400">
          A Dixon-Coles model finds the edges; a paper bankroll measures whether you actually have
          one.
        </p>
        <nav className="mt-4 inline-flex gap-1 rounded-xl border border-neutral-800 bg-neutral-900 p-1">
          <button type="button" className={tabCls('bets')} onClick={() => setTab('bets')}>
            Best Bets
          </button>
          <button type="button" className={tabCls('lab')} onClick={() => setTab('lab')}>
            My Lab
          </button>
        </nav>
      </header>

      <main>
        {tab === 'bets' ? (
          <BestBets onLogToLab={logFromBestBets} />
        ) : (
          <div className="space-y-6">
            <Dashboard />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div ref={formRef} className="scroll-mt-4">
                <LogPickForm prefill={prefill} />
              </div>
              <PasteImport onUseSelection={useSelection} />
            </div>

            <PicksList />
            <BankrollCard />
          </div>
        )}
      </main>

      <footer className="mt-8 text-center text-[11px] text-neutral-400">
        Measurement tool, not a money machine. No staking system beats a negative-EV game.
      </footer>
    </div>
  )
}

export default App

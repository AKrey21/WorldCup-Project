import { useAppState } from '../state/store'
import { computeStats, equitySeries } from '../lib/stats'
import { fmtMoney, fmtPct, fmtSignedMoney } from '../lib/format'
import { EquityCurve } from './EquityCurve'

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  const color =
    tone === 'up' ? 'text-green-700' : tone === 'down' ? 'text-red-600' : 'text-neutral-900'
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  )
}

export function Dashboard() {
  const state = useAppState()
  const s = computeStats(state)
  const points = equitySeries(state)

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Balance
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                Paper money
              </span>
            </div>
            <div className="mt-1 text-4xl font-bold tabular-nums">{fmtMoney(s.balance)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-neutral-500">Net P/L</div>
            <div
              className={`text-lg font-semibold tabular-nums ${
                s.netProfit > 0 ? 'text-green-700' : s.netProfit < 0 ? 'text-red-600' : 'text-neutral-900'
              }`}
            >
              {fmtSignedMoney(s.netProfit)}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <EquityCurve points={points} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="ROI"
          value={s.roiPct === null ? '—' : fmtPct(s.roiPct)}
          tone={s.roiPct === null ? undefined : s.roiPct >= 0 ? 'up' : 'down'}
        />
        <Stat label="Hit rate" value={s.hitRatePct === null ? '—' : fmtPct(s.hitRatePct, 0)} />
        <Stat label="Total staked" value={fmtMoney(s.totalStaked)} />
        <Stat
          label="Streak"
          value={s.streak ? `${s.streak.kind}${s.streak.length}` : '—'}
          tone={s.streak ? (s.streak.kind === 'W' ? 'up' : 'down') : undefined}
        />
        <Stat
          label="Biggest win"
          value={s.biggestWin === null ? '—' : fmtSignedMoney(s.biggestWin)}
          tone={s.biggestWin === null ? undefined : 'up'}
        />
        <Stat
          label="Biggest loss"
          value={s.biggestLoss === null ? '—' : fmtSignedMoney(s.biggestLoss)}
          tone={s.biggestLoss === null ? undefined : 'down'}
        />
        <Stat label="Open stake" value={`${fmtMoney(s.openStake)} (${s.pendingCount})`} />
        <Stat label="Settled" value={String(s.settledCount)} />
      </div>
    </section>
  )
}

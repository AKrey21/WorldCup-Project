import type { EquityPoint } from '../lib/stats'
import { fmtMoney } from '../lib/format'

const W = 600
const H = 220
const PAD = { top: 16, right: 16, bottom: 24, left: 52 }

export function EquityCurve({ points }: { points: EquityPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-neutral-400">
        Settle your first pick to start the curve.
      </div>
    )
  }

  const values = points.map((p) => p.balance)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW
  const y = (v: number) => PAD.top + (1 - (v - min) / span) * innerH

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ')
  const start = points[0].balance
  const last = points[points.length - 1].balance
  const up = last >= start

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Equity curve">
      {/* baseline at starting bankroll */}
      <line
        x1={PAD.left} x2={W - PAD.right} y1={y(start)} y2={y(start)}
        stroke="#404040" strokeDasharray="4 4" strokeWidth="1"
      />
      <text x={PAD.left - 6} y={y(start) + 4} textAnchor="end" fontSize="11" fill="#a3a3a3">
        {fmtMoney(start)}
      </text>
      <text x={PAD.left - 6} y={y(max) + 4} textAnchor="end" fontSize="11" fill="#a3a3a3">
        {fmtMoney(max)}
      </text>
      <text x={PAD.left - 6} y={y(min) + 4} textAnchor="end" fontSize="11" fill="#a3a3a3">
        {fmtMoney(min)}
      </text>
      <path d={path} fill="none" stroke={up ? '#10b981' : '#dc2626'} strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.balance)} r="3" fill={up ? '#10b981' : '#dc2626'} />
      ))}
      <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize="11" fill="#a3a3a3">
        {points.length - 1} settled · now {fmtMoney(last)}
      </text>
    </svg>
  )
}

import { evFlag, expectedValue } from '../lib/ev'

export function EVBadge({ estProb, odds }: { estProb?: number; odds: number }) {
  const flag = evFlag(estProb, odds)
  if (!flag || estProb === undefined) return null
  const ev = expectedValue(estProb, odds)
  const positive = flag === '+EV'
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ' +
        (positive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300')
      }
    >
      {positive ? '+EV' : '−EV'} {(ev * 100).toFixed(1)}¢/$1
    </span>
  )
}

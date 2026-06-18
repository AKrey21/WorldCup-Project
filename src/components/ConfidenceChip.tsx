import type { Confidence, ConfidenceTier } from '../lib/confidence'

// Outlined pill + dot — deliberately a different visual language from the FILLED
// emerald/amber value chips (BET/LEAN, edge tiers) so confidence never reads as
// "good bet". Sky = clear read, amber = tossup (caution), neutral = lean.
const STYLE: Record<ConfidenceTier, { chip: string; dot: string }> = {
  clear: { chip: 'border-sky-500/40 text-sky-300', dot: 'bg-sky-400' },
  lean: { chip: 'border-neutral-700 text-neutral-300', dot: 'bg-neutral-400' },
  tossup: { chip: 'border-amber-500/40 text-amber-300', dot: 'bg-amber-400' },
}

export function ConfidenceChip({ c, className = '' }: { c: Confidence; className?: string }) {
  const s = STYLE[c.tier]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${s.chip} ${className}`}
      title={`Model read: ${c.label} — ${Math.round(c.top * 100)}% favoured side, ${Math.round(
        c.gap * 100,
      )}pt gap to the other. This is how decisive the prediction is, not its betting value.`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {c.label}
    </span>
  )
}

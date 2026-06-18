import type { ReactNode } from 'react'

/** A click-to-expand section built on native <details>, styled to match the cards. */
export function Collapsible({
  title,
  defaultOpen = false,
  bodyClass = 'px-4 py-4',
  children,
}: {
  title: string
  defaultOpen?: boolean
  bodyClass?: string
  children: ReactNode
}) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-neutral-800 bg-neutral-900">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="text-neutral-500 transition-transform group-open:rotate-180" aria-hidden>
          ⌄
        </span>
      </summary>
      <div className={`border-t border-neutral-800 ${bodyClass}`}>{children}</div>
    </details>
  )
}

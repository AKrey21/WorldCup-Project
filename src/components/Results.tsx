import { useEffect, useMemo, useState } from 'react'
import { getPreTournamentModel } from '../lib/bestbets'
import type { FittedModel } from '../lib/model/fit'
import {
  buildRecap,
  loadPlayedResults,
  type MarketComparison,
  type Outcome,
  type RecapRow,
} from '../lib/recap'
import {
  confidence1x2,
  confidenceBinary,
  hitRatesByTier,
  reliabilityCurve,
  type CalibrationBin,
  type ConfidenceTier,
  type TierStats,
} from '../lib/confidence'
import { ConfidenceChip } from './ConfidenceChip'
import { Collapsible } from './Collapsible'

function pct(x: number, dp = 0): string {
  return `${(x * 100).toFixed(dp)}%`
}

function outcomeLabel(o: Outcome, home: string, away: string): string {
  return o === 'home' ? home : o === 'away' ? away : 'Draw'
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T18:00:00Z`).toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
  })
}

/** model probability the model gave the side that actually won/drew. */
function probOfActual(r: RecapRow): number {
  return r.actual === 'home' ? r.probs.home : r.actual === 'away' ? r.probs.away : r.probs.draw
}

export function Results() {
  const [model, setModel] = useState<FittedModel | null>(null)

  // Fit the pre-tournament model after first paint so the spinner shows.
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      const m = getPreTournamentModel()
      if (!cancelled) setModel(m)
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [])

  const recap = useMemo(() => (model ? buildRecap(model, loadPlayedResults()) : null), [model])

  if (!model || !recap) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 px-5 py-8 text-sm text-neutral-400">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-300" />
        Fitting the model to score the played matches…
      </div>
    )
  }

  const s = recap.summary
  const beatsUniform = s.meanBrier < s.uniformBrier
  const calib = [
    {
      market: 'Match result (1X2)',
      stats: hitRatesByTier(recap.rows.map((r) => ({ c: confidence1x2(r.probs), hit: r.outcomeHit }))),
    },
    {
      market: 'Over / Under 2.5',
      stats: hitRatesByTier(recap.rows.map((r) => ({ c: confidenceBinary(r.pOver), hit: r.ouHit }))),
    },
    {
      market: 'Both teams to score',
      stats: hitRatesByTier(recap.rows.map((r) => ({ c: confidenceBinary(r.pBttsYes), hit: r.bttsHit }))),
    },
  ]

  // Reliability curves: one (probability, did-it-happen) pair per outcome. For the
  // binary markets we include both sides (Over & Under, Yes & No) so the bins fill
  // symmetrically — the same treatment as the three 1X2 outcomes.
  const reliability = [
    {
      market: 'Match result (1X2)',
      bins: reliabilityCurve(
        recap.rows.flatMap((r) => [
          { p: r.probs.home, hit: r.actual === 'home' },
          { p: r.probs.draw, hit: r.actual === 'draw' },
          { p: r.probs.away, hit: r.actual === 'away' },
        ]),
      ),
    },
    {
      market: 'Over / Under 2.5',
      bins: reliabilityCurve(
        recap.rows.flatMap((r) => {
          const over = r.homeScore + r.awayScore > 2.5
          return [
            { p: r.pOver, hit: over },
            { p: 1 - r.pOver, hit: !over },
          ]
        }),
      ),
    },
    {
      market: 'Both teams to score',
      bins: reliabilityCurve(
        recap.rows.flatMap((r) => {
          const btts = r.homeScore > 0 && r.awayScore > 0
          return [
            { p: r.pBttsYes, hit: btts },
            { p: 1 - r.pBttsYes, hit: !btts },
          ]
        }),
      ),
    },
  ]

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-sky-800 to-sky-950 text-white">
        <div className="px-5 py-6 sm:px-7 sm:py-7">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-sky-200">
            <span className="inline-block h-2 w-2 rounded-full bg-sky-300" />
            Out-of-sample · the model's report card
          </div>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">How the model called it</h2>
          <p className="mt-1 max-w-2xl text-sm text-sky-100">
            Every World Cup match played so far, re-run through a model fit{' '}
            <span className="font-semibold text-white">only on internationals up to {model.asOf}</span>{' '}
            — before a ball was kicked, so it has never seen any of these games. A genuine held-out
            test of whether the probabilities are calibrated, not a backfit.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-sky-100">
            <span>
              Scored <span className="font-semibold text-white">{s.n}</span> matches
            </span>
            {recap.skipped.length > 0 && (
              <span>
                Skipped <span className="font-semibold text-white">{recap.skipped.length}</span>{' '}
                (team not in model)
              </span>
            )}
            <span>
              Model cutoff <span className="font-semibold text-white">{model.asOf}</span>
            </span>
            <span>
              Results to <span className="font-semibold text-white">{recap.asOf}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Scorecard */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="1X2 called right"
          value={`${s.outcomeHits}/${s.n}`}
          sub={pct(s.outcomeHitRate)}
          tone={s.outcomeHitRate >= 0.5 ? 'up' : undefined}
        />
        <Stat label="Over/Under 2.5" value={`${s.ouHits}/${s.n}`} sub={pct(s.ouHitRate)} />
        <Stat label="BTTS" value={`${s.bttsHits}/${s.n}`} sub={pct(s.bttsHitRate)} />
        <Stat label="Exact score" value={`${s.exactHits}/${s.n}`} sub="hardest market" />
      </div>

      {/* The real test: model vs the de-vigged book line */}
      {recap.market && <MarketCard m={recap.market} total={s.n} />}

      {/* Probabilistic skill */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat
          label="Mean Brier (1X2)"
          value={s.meanBrier.toFixed(3)}
          sub={`vs ${s.uniformBrier.toFixed(3)} for a coin-flip — lower is better`}
          tone={beatsUniform ? 'up' : 'down'}
          wide
        />
        <Stat
          label="Mean log-loss (1X2)"
          value={s.meanLogLoss.toFixed(3)}
          sub={`vs ${s.uniformLogLoss.toFixed(3)} uninformed — lower is better`}
          tone={s.meanLogLoss < s.uniformLogLoss ? 'up' : 'down'}
          wide
        />
      </div>

      <p className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-[11px] leading-snug text-neutral-400">
        {beatsUniform ? (
          <>
            The model is <span className="font-semibold text-emerald-400">beating</span> an uninformed
            forecast on Brier score — encouraging on a tiny {s.n}-match sample, but the first round of
            a World Cup is famously upset-heavy. Treat as a sanity check, not proof of an edge.
          </>
        ) : (
          <>
            The model is <span className="font-semibold text-amber-400">not yet beating</span> an
            uninformed forecast — expected this early: opening World Cup matches are upset-heavy and{' '}
            {s.n} games is far too few to judge calibration. Watch the trend as the group stage fills
            in.
          </>
        )}
      </p>

      {/* Deep-dive panels — collapsed by default to keep the page short */}
      <Collapsible title="Confidence — does the colour mean anything?">
        <ConfidenceCalibration groups={calib} />
      </Collapsible>

      <Collapsible title="Reliability — predicted vs actual">
        <ReliabilityPanel groups={reliability} />
      </Collapsible>

      {/* Per-match table */}
      <Collapsible title="Per-match detail" bodyClass="">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-3 py-2 font-medium">Match</th>
              <th className="px-3 py-2 font-medium">Score</th>
              <th className="px-3 py-2 font-medium">Model 1X2 (H / D / A)</th>
              <th className="px-3 py-2 font-medium">Model pick</th>
              <th className="px-3 py-2 font-medium">xG / pred</th>
              <th className="px-3 py-2 text-center font-medium">1X2</th>
              <th className="px-3 py-2 text-center font-medium">O/U</th>
              <th className="px-3 py-2 text-center font-medium">BTTS</th>
            </tr>
          </thead>
          <tbody>
            {recap.rows.map((r) => (
              <tr
                key={`${r.date}-${r.home}-${r.away}`}
                className="border-b border-neutral-800 last:border-b-0"
              >
                <td className="px-3 py-2">
                  <div className="font-medium leading-tight">
                    {r.home} <span className="text-neutral-600">v</span> {r.away}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {fmtDate(r.date)}
                    {r.group ? ` · Group ${r.group}` : ''}
                  </div>
                </td>
                <td className="px-3 py-2 font-semibold tabular-nums">
                  {r.homeScore}–{r.awayScore}
                </td>
                <td className="px-3 py-2 tabular-nums text-neutral-300">
                  <span className={r.actual === 'home' ? 'font-semibold text-white' : ''}>
                    {pct(r.probs.home)}
                  </span>{' '}
                  /{' '}
                  <span className={r.actual === 'draw' ? 'font-semibold text-white' : ''}>
                    {pct(r.probs.draw)}
                  </span>{' '}
                  /{' '}
                  <span className={r.actual === 'away' ? 'font-semibold text-white' : ''}>
                    {pct(r.probs.away)}
                  </span>
                  <div className="text-[10px] text-neutral-600">
                    gave {pct(probOfActual(r))} to the actual result
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="text-neutral-200">
                    {outcomeLabel(r.modelPick, r.home, r.away)}
                  </div>
                  <ConfidenceChip c={confidence1x2(r.probs)} className="mt-1" />
                </td>
                <td className="px-3 py-2 tabular-nums text-xs text-neutral-400">
                  {r.lh.toFixed(1)}–{r.la.toFixed(1)}
                  <span className="text-neutral-600">
                    {' '}
                    · {r.predScore.home}-{r.predScore.away}
                  </span>
                </td>
                <Tick ok={r.outcomeHit} />
                <Tick ok={r.ouHit} />
                <Tick ok={r.bttsHit} />
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="px-4 py-3 text-[11px] leading-snug text-neutral-500">
          Bold % is the probability the model assigned to the outcome that actually happened. Brier
          and log-loss reward being confident <span className="italic">and</span> right; a model that
          hedges everything to 33/33/33 scores the reference values shown above. Results from
          authoritative per-group tables; kept out of the training data so this stays an honest
          held-out test.
        </p>
      </Collapsible>
    </section>
  )
}

function Stat({
  label,
  value,
  sub,
  tone,
  wide,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'up' | 'down'
  wide?: boolean
}) {
  const valueCls =
    tone === 'up' ? 'text-emerald-400' : tone === 'down' ? 'text-amber-400' : 'text-neutral-100'
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-1 font-semibold tabular-nums ${wide ? 'text-2xl' : 'text-lg'} ${valueCls}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-neutral-500">{sub}</div>}
    </div>
  )
}

function MarketCard({ m, total }: { m: MarketComparison; total: number }) {
  const bss = m.brierSkillScore
  const verdict =
    bss > 0.02
      ? { label: 'Beating the book', cls: 'text-emerald-400', tone: 'bg-emerald-500/10 border-emerald-500/30' }
      : bss < -0.02
        ? { label: 'Behind the book', cls: 'text-amber-400', tone: 'bg-amber-500/10 border-amber-500/30' }
        : { label: 'Line with the book', cls: 'text-neutral-200', tone: 'bg-neutral-800/40 border-neutral-700' }

  return (
    <div className={`rounded-2xl border px-4 py-4 ${verdict.tone}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          Model vs the market — the real test
        </div>
        <div className="text-[11px] text-neutral-500">
          on {m.n} of {total} played games that carry odds
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`text-3xl font-bold tabular-nums ${verdict.cls}`}>
          {bss >= 0 ? '+' : ''}
          {bss.toFixed(3)}
        </span>
        <span className={`text-sm font-semibold ${verdict.cls}`}>{verdict.label}</span>
        <span className="text-[11px] text-neutral-500">
          Brier Skill Score vs the de-vigged book (&gt;0 = sharper than the book)
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
        <Compare label="Brier" model={m.modelBrier} market={m.marketBrier} />
        <Compare label="Log-loss" model={m.modelLogLoss} market={m.marketLogLoss} />
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500">Model sharper</div>
          <div className="mt-0.5 text-base font-semibold tabular-nums text-neutral-100">
            {m.modelSharperCount}/{m.n}
          </div>
          <div className="text-[10px] text-neutral-500">games it beat the book on the result</div>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-snug text-neutral-400">
        This is the benchmark that matters: can the model out-predict the bookmaker, not just a
        coin-flip? Beating sharp lines is hard — near parity is a normal, respectable result for a
        full-time goals model. On just {m.n} upset-heavy openers this is directional only, and the
        odds are best-available pre-match prices from mixed books, not synchronised closing lines.
      </p>
    </div>
  )
}

function Compare({ label, model, market }: { label: string; model: number; market: number }) {
  const better = model < market
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label} (lower better)</div>
      <div className="mt-0.5 flex items-baseline gap-2 tabular-nums">
        <span className={`text-base font-semibold ${better ? 'text-emerald-400' : 'text-neutral-200'}`}>
          {model.toFixed(3)}
        </span>
        <span className="text-[11px] text-neutral-500">model</span>
        <span className="text-base font-semibold text-neutral-400">{market.toFixed(3)}</span>
        <span className="text-[11px] text-neutral-500">book</span>
      </div>
    </div>
  )
}

const DOT: Record<ConfidenceTier, string> = {
  clear: 'bg-sky-400',
  lean: 'bg-neutral-400',
  tossup: 'bg-amber-400',
}

function ConfidenceCalibration({ groups }: { groups: { market: string; stats: TierStats[] }[] }) {
  return (
    <>
      <p className="max-w-2xl text-[11px] leading-snug text-neutral-500">
        Hit rate split by how decisive the model's read was, per market. If the colours are{' '}
        <span className="italic">earned</span>, a “clear” read should out-hit a “tossup”, and each
        bucket should land near the probability the model claimed (impl).
      </p>
      <div className="mt-3 space-y-3">
        {groups.map((g) => (
          <div key={g.market}>
            <div className="mb-1.5 text-[11px] font-medium text-neutral-300">{g.market}</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {g.stats.map((t) => (
                <div
                  key={t.tier}
                  className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2"
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${DOT[t.tier]}`} aria-hidden />
                    <span className="text-xs font-medium text-neutral-200">{t.label}</span>
                    <span className="ml-auto text-[10px] text-neutral-500">{t.n}g</span>
                  </div>
                  {t.n > 0 ? (
                    <div className="mt-1 flex items-baseline gap-1.5 tabular-nums">
                      <span className="text-base font-semibold text-neutral-100">{pct(t.hitRate)}</span>
                      <span className="text-[10px] text-neutral-500">
                        hit ({t.hits}/{t.n})
                      </span>
                      <span className="ml-auto text-[10px] text-neutral-500">impl ~{pct(t.meanTop)}</span>
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-neutral-600">—</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-snug text-neutral-500">
        Tiny samples this early — directional only. A “tossup” landing near a coin-flip is the{' '}
        <span className="italic">point</span>. Confidence is a separate axis from value: the best
        price is often on a tossup, and a “clear” read that under-hits its implied number means the
        model is overconfident there, not that the bet is bad.
      </p>
    </>
  )
}

function ReliabilityPanel({ groups }: { groups: { market: string; bins: CalibrationBin[] }[] }) {
  return (
    <>
      <p className="max-w-2xl text-[11px] leading-snug text-neutral-500">
        Every forecast bucketed by the probability it carried. A calibrated model lands{' '}
        <span className="italic">on the diagonal</span> — when it says 60%, those happen ~60% of the
        time. Bar = how often it actually happened; the light tick = what the model predicted.
      </p>
      <div className="mt-3 space-y-3">
        {groups.map((g) => (
          <div key={g.market}>
            <div className="mb-1.5 text-[11px] font-medium text-neutral-300">{g.market}</div>
            <div className="space-y-2">
              {g.bins
                .filter((b) => b.n > 0)
                .map((b) => {
                  const diff = b.observed - b.predicted
                  const tone =
                    Math.abs(diff) <= 0.08
                      ? 'text-emerald-400'
                      : diff < 0
                        ? 'text-amber-400'
                        : 'text-sky-400'
                  return (
                    <div key={b.label} className="flex items-center gap-2 text-xs">
                      <span className="w-14 shrink-0 tabular-nums text-neutral-500">{b.label}</span>
                      <div className="relative h-3 flex-1 overflow-hidden rounded bg-neutral-800">
                        <div
                          className="absolute inset-y-0 left-0 rounded bg-neutral-600"
                          style={{ width: `${Math.min(100, b.observed * 100)}%` }}
                        />
                        <div
                          className="absolute inset-y-0 w-0.5 bg-neutral-200"
                          style={{ left: `${Math.min(100, b.predicted * 100)}%` }}
                          title={`predicted ${(b.predicted * 100).toFixed(0)}%`}
                        />
                      </div>
                      <span className={`w-24 shrink-0 text-right tabular-nums ${tone}`}>
                        {(b.observed * 100).toFixed(0)}% / {(b.predicted * 100).toFixed(0)}%
                      </span>
                      <span className="w-9 shrink-0 text-right tabular-nums text-neutral-600">
                        n={b.n}
                      </span>
                    </div>
                  )
                })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-snug text-neutral-500">
        obs / pred = how often it happened vs what the model said. Tiny per-bin samples this early —
        read the shape, not any single bar.
      </p>
    </>
  )
}

function Tick({ ok }: { ok: boolean }) {
  return (
    <td className="px-3 py-2 text-center">
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
          ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/10 text-red-400/80'
        }`}
        title={ok ? 'Model called this market correctly' : 'Model missed this market'}
      >
        {ok ? '✓' : '✗'}
      </span>
    </td>
  )
}

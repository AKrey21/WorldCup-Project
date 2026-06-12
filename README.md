# World Cup Betting Lab

A paper-trading + prediction lab for the 2026 World Cup. Log real Singapore
Pools odds with fake money and find out the only thing that matters: **do I
actually have an edge?** It is a measurement tool, not a money machine.

Single-user local web app — Vite + React + TypeScript + Tailwind, persisted to
`localStorage`, no backend.

## MVP (Phase 1) — what's here

- **Paper bankroll** — default $100, clearly labelled, one recycling pot with a
  hard cap (stakes are checked against the available balance).
- **Log a pick** — match, market, selection, SG Pools decimal odds, stake, and
  an optional own-probability estimate. Every pick carries a `capturedAt`
  snapshot timestamp.
- **Paste-import parser** — copy the odds block off the SG Pools page and paste
  it (never scrape). Handles the `[2-digit code][odds N.NN][label]` grammar,
  segments multiple matches, and stamps each snapshot. Click any parsed
  selection to prefill the log form.
- **Stale-snapshot nudge** — odds are live; if you log off a capture more than
  5 minutes old, the form warns you to re-grab.
- **Settle picks** — win / loss / void for simple markets; push / half-win /
  half-loss for Asian Handicap, plus a settle-from-score helper that applies
  the full AH settlement logic (half, whole and quarter lines).
- **Dashboard** — running balance (always derived from settled picks, never
  stored), net P/L, ROI %, hit rate, total staked, biggest win/loss, current
  streak, and an equity-curve chart.
- **+EV / −EV flag** — implied probability (1/odds) on every selection; if you
  entered your own estimate, the EV per $1 is computed as
  `p·(odds−1) − (1−p)` and flagged.

By design there is **no Martingale / auto-doubling stake helper** anywhere.
Skipping a bet is a move.

## Run it

```bash
npm install
npm run dev      # local dev server
npm test         # vitest — parser, settlement, stats
npm run build    # type-check + production build
```

## Roadmap

- **Phase 2 (after the tournament):** prediction pipeline — data adapter,
  Dixon-Coles/Poisson + LightGBM, **backtest harness** (the referee),
  calibration checks, then Kelly staking as an advisory card only.
- **Phase 3 (optional):** news context as an informational dashboard widget —
  never a model input.

This World Cup is the data-collection run: paper-trade your own reads, capture
closing odds via the parser, and finish with a clean picks-vs-odds dataset to
backtest against.

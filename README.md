# World Cup Prop Predictor

A model + paper-trading lab for the 2026 World Cup. A Dixon-Coles model finds
the edges; a paper bankroll measures whether you **actually** have one. It is a
measurement tool, not a money machine.

Single-user local web app — Vite + React + TypeScript + Tailwind, persisted to
`localStorage`, no backend. Two tabs:

- **Best Bets** — every fixture run through a Dixon-Coles scoreline model fit on
  ~11,900 real international results. For each match the model surfaces its
  favoured side in three core markets (match result, total goals O/U 2.5, both
  teams to score), the implied **fair** odds, and — once you drop in a real book
  price (or flip on illustrative demo prices) — the **edge** and **EV per $1**,
  ranked and tiered High / Medium / Low. Hit **Log** to send a pick to the lab
  with the model probability prefilled as your estimate.

  Book prices go in by hand, or via **Auto-fill book odds from a paste** — an
  AI importer that takes any messy odds block (abbreviations, fractional or
  American prices, reordered columns) and maps each price to the right fixture
  and market with Claude (`claude-opus-4-8`), then fills the matched cells. It
  needs your own Anthropic API key, stored only in this browser's `localStorage`
  and sent directly to `api.anthropic.com` when you click Match — never
  anywhere else, and only on that explicit action.
- **My Lab** — the paper-trading bankroll, manual pick logging, SG Pools
  paste-import, settlement and the equity dashboard described below.

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
npm run dev          # local dev server
npm test             # vitest — parser, settlement, stats, model, best-bets
npm run build        # type-check + production build
npm run update-data  # re-pull latest results + WC fixtures (then reload)
```

## CI & deploy

Two GitHub Actions workflows live in [`.github/workflows`](.github/workflows):

- **CI** (`ci.yml`) — on every push / PR: `npm ci`, lint, test, build.
- **Deploy** (`deploy.yml`) — builds with the Pages base path and publishes to
  GitHub Pages on pushes to the default branch.

One-time setup for the live site: in the repo, **Settings → Pages → Build and
deployment → Source: GitHub Actions**. The site then deploys to
`https://<owner>.github.io/WorldCup-Project/`.

## Roadmap

- **Phase 2 (after the tournament):** prediction pipeline — data adapter,
  Dixon-Coles/Poisson + LightGBM, **backtest harness** (the referee),
  calibration checks, then Kelly staking as an advisory card only.
- **Phase 3 (optional):** news context as an informational dashboard widget —
  never a model input.

This World Cup is the data-collection run: paper-trade your own reads, capture
closing odds via the parser, and finish with a clean picks-vs-odds dataset to
backtest against.

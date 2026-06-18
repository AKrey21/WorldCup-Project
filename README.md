# World Cup Prop Predictor

A model + paper-trading lab for the 2026 World Cup. A Dixon-Coles model finds
the edges; a paper bankroll measures whether you **actually** have one. It is a
measurement tool, not a money machine.

Single-user local web app — Vite + React + TypeScript + Tailwind, persisted to
`localStorage`, no backend. Three tabs:

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
  and market with Claude (`claude-opus-4-8`), then fills the matched cells.

  **Pick of the Day** — a World Cup day has several kick-offs at once, so this
  ranks the whole day's slate into the best one-to-three disciplined value bets,
  each with a rationale. Optionally it first runs **web research**: Claude's
  server-side `web_search` tool looks up injuries, likely line-ups, form and
  motivation for that day's fixtures and folds the news into the read (the model
  stays the spine — news adjusts, it doesn't override). The search runs on
  Anthropic's servers, so this static, backend-less app gets live news with no
  scraper and no CORS proxy; it uses the billable web-search add-on, so it's an
  opt-in toggle.

  Each match card also carries a **confidence tier** — Clear favourite / Lean /
  **Tossup** — a *separate axis from value* (the best price is often on a tossup,
  so this never reads as a bet signal). Two opt-in switches sit in the controls:
  **goal-environment recalibration**, an adaptive, shrunk scale on the model's
  expected goals so BTTS/Over track the tournament's live scoring rate (this World
  Cup is running hot), and **uncertainty bands**, a nonparametric bootstrap that
  shows a ± on each probability — wide means the model has thin data on those
  teams. A per-match **AI context brief** (server-side web search) surfaces
  injuries, suspensions, likely line-ups, form and motivation — the things a
  full-time-goals model is blind to — as *information only*, never a model input.

  A collapsible **Group standings** panel tallies the played fixtures into live
  tables (top two highlighted), and each match card shows both sides' current
  group position and points. Deterministic, no API cost — context for stakes and
  motivation (a must-win side, a dead rubber) that feeds your read and the AI
  brief, not the model's numbers.
- **Results** — the model's **out-of-sample report card**. Every World Cup match
  already played is re-run through a model fit *only* on internationals before the
  tournament kicked off (`getPreTournamentModel()`, cutoff 2026-06-11) and
  compared to what actually happened: 1X2 / over-under / both-teams-to-score hit
  rates, plus **Brier score** and **log-loss** against an uninformed 1/3-1/3-1/3
  baseline. A genuine held-out calibration check, not a backfit — the dedicated
  pre-tournament fit guarantees the model never trained on the games it is graded
  on, even though the upstream results feed already carries some of them.

  The headline is **Model vs the market**: for the games that carry a pre-match
  book price (`odds` in [`played.json`](src/data/played.json)), the line is
  de-vigged into the book's own probabilities and scored the same way, and a
  **Brier Skill Score** (`1 − model_Brier / market_Brier`) says whether the model
  out-predicts the bookmaker — the benchmark that actually answers "are we beating
  the odds?". Beating a coin-flip is trivial; beating the market is the real test,
  and near-parity is a respectable result for a simple full-time-goals model.

  Two collapsible deep-dives back the headline up. **Confidence — does the colour
  mean anything?** shows the realised hit rate by Clear / Lean / Tossup tier, per
  market, against the rate the model implied (so the colours are *earned*, not
  asserted). **Reliability — predicted vs actual** bins every forecast by its
  probability and plots claimed vs realised for 1X2, Over/Under and BTTS — making
  the model's over- or under-confidence visible rather than assumed.
- **My Lab** — the paper-trading bankroll, manual pick logging, SG Pools
  paste-import, settlement, the equity dashboard described below, and a one-click
  **CSV / JSON export** of your full picks-vs-odds dataset. Each pick also takes a
  **closing price**, and the lab reports **Closing Line Value (CLV)** — whether you
  beat the close, per pick and in aggregate. CLV is the surest signal of a real
  edge and works on a far smaller sample than win/loss, so it's the metric to watch.

The AI features (paste importer, per-match verdict) need your own Anthropic API
key. Set it once via the **API key** button in the header; it is stored only in
this browser's `localStorage` and sent directly to `api.anthropic.com` on the
actions that use it — never anywhere else. On a public deploy (e.g. GitHub Pages)
use a dedicated, spend-capped key you can revoke. The board and tracker work
fully without a key.

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

## Played-results data

The **Results** tab reads [`src/data/played.json`](src/data/played.json) — the
matchday-1 scorelines, taken from the authoritative per-group Wikipedia tables
and cross-checked. The honest part of the recap is the *model*, not the data file:
the upstream results feed in `results.json` already contains some 2026 World Cup
games, so the recap scores everything with `getPreTournamentModel()` — a fit
restricted to matches before 2026-06-11 — which is guaranteed never to have seen
the games it grades. Append new rows to `played.json` to extend the report card.

## Roadmap

- **Phase 2 (after the tournament):** prediction pipeline — data adapter,
  Dixon-Coles/Poisson + LightGBM, a full **backtest harness** (the Results tab is
  the first slice of this referee), deeper calibration plots, then Kelly staking
  as an advisory card only.
- **Phase 3 (optional):** news context as an informational dashboard widget —
  never a model input.

This World Cup is the data-collection run: paper-trade your own reads, capture
closing odds via the parser, and **export** (My Lab → Download CSV/JSON) a clean
picks-vs-odds dataset to backtest against.

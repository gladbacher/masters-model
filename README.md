# Green Book — live golf tournament model

**Live: https://gladbacher.github.io/masters-model/**

A client-side web app that models every event on the five major tours (PGA, DP World,
LPGA, Champions, LIV) — pre-tournament and **in-play** — and compares its probabilities
against bookmaker prices to find value. Inspired by DataGolf, built on free data.

## Run it

```sh
npm install
npm run dev
```

Open http://localhost:5173. Pick a tour; the current event loads automatically and
refreshes every 90 seconds while play is live.

## What it does

- **Model tab** — live leaderboard with win / top-5 / top-10 / top-20 / make-cut
  probabilities and fair decimal odds, from 5,000 Monte Carlo simulations of the
  remaining holes.
- **Value finder** — paste bookmaker prices (decimal, fractional, or American),
  pick a market, and get model-vs-market edge, EV per unit, and ¼-Kelly stakes.
- **Bet tracker** — one-click logging from the Value finder (paper bets first),
  closing-odds entry, and CLV/ROI tracking — the feedback loop that proves (or
  disproves) the edge. Stored locally in the browser; exports to CSV.
- **In-play** — known scores are locked, only remaining holes are simulated, and
  course difficulty is re-estimated live from what the field is shooting today.

## Data (all free)

| Source | What | How |
|---|---|---|
| ESPN unofficial API | Live leaderboards, hole-by-hole, tee times, cut status | Fetched live from the browser (CORS-open, no key) |
| OWGR | Men's skill ratings (points average → strokes-gained proxy) | Snapshot bundled in `src/data/owgr.json` |
| ESPN results archive | Women's skill ratings, fitted from LPGA results | Built into `src/data/lpga-ratings.json` |

A GitHub Actions cron refreshes both every Monday and redeploys (see
`.github/workflows/deploy.yml`). To refresh locally:

```sh
npm run update-rankings
npm run build-ratings lpga 1
```

### Women's golf

OWGR has no women, and the Rolex Women's World Rankings are CDN-blocked to
automated clients, so LPGA ratings are fitted from actual results instead:
per-round strokes vs field, adjusted for field strength and weighted for
recency (`scripts/build-ratings.mjs`). Validated against the Rolex top 10 —
the top two match exactly and seven of the top twelve appear in the Rolex top ten.

### Course renovations

ESPN's course card is **not** reliably updated after a redesign: for the 2026
Rocket Classic it served the pre-renovation par-72 card, byte-identical to
2024 and 2025, months after Detroit Golf Club became a par 70. Known changes
live in `src/data/courseOverrides.js`, override ESPN, show a warning on the
course panel, and can mark past editions at the venue as void so they stop
feeding the history and course-fit signals.

## Architecture

```
src/api/espn.js         ESPN fetch + normalization (5 tours)
src/model/ratings.js    OWGR points → skill (SG/round proxy), name matching
src/model/simulate.js   Monte Carlo engine (rounds, partial rounds, cut logic)
src/model/betting.js    odds parsing, implied prob, EV, Kelly
src/components/         Model table, Value finder
```

No backend, no keys, no running costs. Deployable as a static site (GitHub Pages,
Cloudflare Pages) for free.

## Honest caveats

The skill rating is an OWGR proxy, not true strokes-gained — it misses course fit,
recent form, and player-specific variance. Treat small edges as model error. See
[docs/STRATEGY.md](docs/STRATEGY.md) for the betting strategy, upgrade path, and
how to validate the model before staking real money.

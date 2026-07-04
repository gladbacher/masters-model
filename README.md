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
| OWGR | Player skill ratings (points average → strokes-gained proxy) | Snapshot bundled in `src/data/owgr.json` |

OWGR updates Mondays — a GitHub Actions cron refreshes the snapshot and redeploys
the site automatically every Monday (see `.github/workflows/deploy.yml`). To
refresh locally:

```sh
npm run update-rankings
```

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

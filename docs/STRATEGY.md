# Strategy: from model to profitable betting

## The thesis (why in-play golf)

Golf in-play is genuinely one of the less efficient betting markets:

- **150+ simultaneous "runners"** across a 5-hour window. Books reprice with models
  plus trader oversight, and the long tail (players 10th–40th) gets much less
  attention than the favourites.
- **Positional markets** (top 5/10/20, make cut, 3-balls) are derivative markets
  priced off winner models — errors compound there, and limits are softer.
- **Regime changes mid-round** — wind picking up, a leader making the turn into the
  hard stretch — take minutes to fully propagate into prices. A model that
  re-estimates course difficulty live (this one does) reacts on the next refresh.
- **The cut market** near the bubble on Friday afternoon is driven by a fast-moving
  projected cut line; recreational money is heavily biased to "yes".

The honest counterweight: in-play golf overrounds are fat (8–20% on winner markets),
bet-acceptance delays exist, and books limit winners quickly. The realistic path is
**exchange betting (Betfair) for winner/positional markets**, where you pay
commission instead of margin, plus soft-book positional markets while accounts last.

## Rule #1: prove the edge before spending anything

Do not pay for data or place real bets until the model beats the closing line on
paper. The workflow:

1. Each event, record the model's prices and the market's prices (screenshot or CSV)
   at fixed times — Wednesday night, and 2–3 in-play checkpoints.
2. Track **CLV (closing line value)**: did the prices you flagged as value shorten
   by the close / settlement? Beating the close consistently is the strongest
   predictor of long-term profit — you don't need to wait for results variance.
3. 20–30 events of positive CLV on a market type = real signal. Then stake at
   ¼ Kelly max.

## Cost ladder (only climb when the previous rung pays)

| Rung | Cost | What you get |
|---|---|---|
| 0 (now) | £0 | ESPN live + OWGR proxy skill. Good enough to test the *process* and in-play mechanics. |
| 1 | ~$30/mo | **DataGolf Scratch Plus API**: true strokes-gained skill ratings, course fit, live predictions to benchmark against. This is the single biggest model upgrade available. |
| 2 | £299 one-off | **Betfair Exchange live API key**: automated live odds feed, place/track exchange bets, CLV logging becomes automatic. (Delayed key is free — fine for development.) |
| 3 | optional | The Odds API or similar (~$0–50/mo) for multi-bookmaker prices to spot the softest number. |

Total to be fully armed: roughly £50–70/month equivalent. A single well-sized value
bet a week covers it *if* the edge is real — which is exactly what step 1 verifies
first.

## Covering the costs (ways this pays for itself)

1. **The edge itself** — the intended path. At a £1,000 bankroll and ¼-Kelly, a
   genuine 10% average edge on ~10 positional bets/week is on the order of
   £15–40/week expected value. Variance is brutal at golf odds; bankroll and
   discipline matter more than the model.
2. **Matched betting / signup offers** funded the bankroll for many pros — zero-edge
   -risk-free, tedious, but it can bankroll the project without touching savings.
3. **Content** — DataGolf itself is proof people pay for golf analytics. A free
   model with a public track record (posted picks with CLV receipts) builds an
   audience; Substack/Ko-fi covers a $30/mo data bill with ~10 subscribers. Only
   viable once the track record exists — do not sell picks before then.

## Model roadmap (in order of expected value)

1. ~~**CLV / bet tracker in the app**~~ — built. Log flagged bets from the Value
   finder, enter closing prices, track CLV/ROI. Use it from day one, on paper.
2. ~~**Look-ahead + weather + course context**~~ — built. Any upcoming event with
   course profile, local-model (Met Office) forecast feeding round difficulty,
   event-history skill nudge, and live odds via a free Odds API key.
3. **Better ratings**: blend OWGR with recent finishes (ESPN has full past
   leaderboards) via a simple decay-weighted fit; or jump straight to DataGolf SG.
4. **Weather waves**: AM/PM tee-time scoring splits are the best-documented golf
   betting edge. Tee times + hourly forecast are both already in hand; split the
   field into waves and apply hour-matched difficulty.
5. **Player-specific variance**: high-variance players are undervalued in outright
   markets and overvalued in make-cut — even a two-bucket (aggressive/steady) split helps.
6. **3-ball / matchup pricing**: head-to-head markets are the softest of all and
   need only relative skill — the model already has everything required.

## Ground rules

- Never bet more than ¼ Kelly; halve it again in-play (model error is larger live).
- No bet under ~10–15% relative edge — small edges are proxy-model noise.
- Positional and matchup markets over outright winners: more bets, less variance,
  softer prices.
- Track every bet. If CLV goes negative over 30+ bets, stop and fix the model.
- This is a long game. UK: gamble only what you can afford to lose — begambleaware.org.

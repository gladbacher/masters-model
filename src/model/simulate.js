// Monte Carlo tournament simulator.
//
// Scores are modelled per round, relative to par:
//   playerRoundScore ~ Normal(roundDifficulty + (fieldMeanSkill - skill), sd)
// Partially played rounds are completed with mean/variance scaled by holes
// remaining. Round difficulty is estimated live from what the field has
// actually shot — so a windy Saturday makes the model expect higher scores
// from everyone still on the course.
//
// Works pre-tournament (full 72-hole sim with cut) and in-play (fixes known
// scores, simulates only what's left). This state-aware re-simulation is the
// core of the in-play edge: books are slow to reprice mid-round.

const ROUND_SD = 2.85 // strokes, per-round score spread for a tour pro
const DEFAULT_DIFF = -0.75 // field avg vs par when we have no live data
const CUT_SIZE = 65 // top 65 + ties (PGA/DPWT standard)

let spare = null
function gaussian() {
  if (spare != null) {
    const v = spare
    spare = null
    return v
  }
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  const mag = Math.sqrt(-2.0 * Math.log(u))
  spare = mag * Math.sin(2.0 * Math.PI * v)
  return mag * Math.cos(2.0 * Math.PI * v)
}

// Field-average score vs par for each round, from live data where available.
function estimateRoundDifficulties(event) {
  const { players, currentRound, roundsTotal } = event
  const diffs = new Array(roundsTotal + 1).fill(null) // 1-indexed

  for (let r = 1; r <= roundsTotal; r++) {
    const done = players
      .filter((p) => p.status !== 'wd')
      .map((p) => p.rounds.find((rd) => rd.period === r && rd.complete))
      .filter(Boolean)
    if (done.length >= 10) {
      diffs[r] = done.reduce((s, rd) => s + rd.rel, 0) / done.length
    }
  }

  // Round in progress: project from players 4+ holes into it
  if (diffs[currentRound] == null) {
    const partial = players.filter(
      (p) => p.status === 'active' && p.currentRound === currentRound && p.thru >= 4 && p.thru < 18,
    )
    if (partial.length >= 8) {
      const proj = partial.map((p) => {
        const rd = p.rounds.find((r) => r.period === currentRound)
        return rd ? (rd.rel * 18) / p.thru : 0
      })
      diffs[currentRound] = proj.reduce((a, b) => a + b, 0) / proj.length
    }
  }

  const known = diffs.filter((d) => d != null)
  const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : DEFAULT_DIFF
  for (let r = 1; r <= roundsTotal; r++) if (diffs[r] == null) diffs[r] = fallback
  return diffs
}

export function simulateEvent(event, skills, { sims = 4000 } = {}) {
  const { players, currentRound, roundsTotal, hasCut } = event
  const n = players.length
  const diffs = estimateRoundDifficulties(event)

  const active = players.filter((p) => p.status === 'active')
  const fieldSkill = active.length
    ? active.reduce((s, p) => s + skills[players.indexOf(p)], 0) / active.length
    : 0

  // Per-player pre-computed simulation plan
  const plan = players.map((p, i) => {
    const skillEdge = fieldSkill - skills[i] // added to round difficulty; negative = good
    const holesLeftNow =
      p.status === 'active' && p.currentRound <= roundsTotal ? 18 - p.thru : 0
    const nextFullRound = p.status === 'active' ? p.currentRound + 1 : roundsTotal + 1
    return {
      base: p.totalRel,
      skillEdge,
      out: p.status !== 'active',
      cutAlready: p.status === 'cut',
      partialRound: holesLeftNow > 0 ? p.currentRound : null,
      holesLeftNow,
      nextFullRound,
    }
  })

  const cutPending = hasCut && !event.cutMade && currentRound <= 2

  const win = new Float64Array(n)
  const top5 = new Float64Array(n)
  const top10 = new Float64Array(n)
  const top20 = new Float64Array(n)
  const makeCut = new Float64Array(n)
  const sumPos = new Float64Array(n)

  const totals = new Float64Array(n)
  const madeIt = new Uint8Array(n)
  const order = new Array(n)

  for (let s = 0; s < sims; s++) {
    // --- Phase A: complete rounds 1..2 (or use known scores) ---
    for (let i = 0; i < n; i++) {
      const pl = plan[i]
      if (pl.out) {
        totals[i] = pl.cutAlready ? pl.base : Infinity
        madeIt[i] = 0
        continue
      }
      let t = pl.base
      if (pl.partialRound != null && pl.partialRound <= 2) {
        const frac = pl.holesLeftNow / 18
        t += (diffs[pl.partialRound] + pl.skillEdge) * frac + ROUND_SD * Math.sqrt(frac) * gaussian()
      }
      for (let r = Math.max(pl.nextFullRound, 1); r <= Math.min(2, roundsTotal); r++) {
        t += diffs[r] + pl.skillEdge + ROUND_SD * gaussian()
      }
      totals[i] = t
      madeIt[i] = 1
    }

    // --- Cut ---
    if (cutPending) {
      const scores = []
      for (let i = 0; i < n; i++) if (madeIt[i]) scores.push(totals[i])
      scores.sort((a, b) => a - b)
      const line = scores[Math.min(CUT_SIZE - 1, scores.length - 1)]
      for (let i = 0; i < n; i++) {
        if (madeIt[i] && totals[i] > line + 1e-9) madeIt[i] = 0
      }
    } else {
      // cut already made (or no cut): everyone still active is through
      for (let i = 0; i < n; i++) if (plan[i].cutAlready) madeIt[i] = 0
    }

    // --- Phase B: remaining rounds for those still in ---
    for (let i = 0; i < n; i++) {
      if (!madeIt[i]) continue
      const pl = plan[i]
      if (pl.partialRound != null && pl.partialRound >= 3) {
        const frac = pl.holesLeftNow / 18
        totals[i] +=
          (diffs[pl.partialRound] + pl.skillEdge) * frac + ROUND_SD * Math.sqrt(frac) * gaussian()
      }
      for (let r = Math.max(pl.nextFullRound, 3); r <= roundsTotal; r++) {
        totals[i] += diffs[r] + pl.skillEdge + ROUND_SD * gaussian()
      }
    }

    // --- Rank finishers ---
    let m = 0
    for (let i = 0; i < n; i++) if (madeIt[i]) order[m++] = i
    const finishers = order.slice(0, m).sort((a, b) => totals[a] - totals[b])

    // winner: random among tied leaders (playoff)
    const best = totals[finishers[0]]
    let tied = 1
    while (tied < m && totals[finishers[tied]] - best < 1e-9) tied++
    win[finishers[(Math.random() * tied) | 0]]++

    let pos = 1
    for (let k = 0; k < m; k++) {
      if (k > 0 && totals[finishers[k]] - totals[finishers[k - 1]] > 1e-9) pos = k + 1
      const i = finishers[k]
      if (pos <= 5) top5[i]++
      if (pos <= 10) top10[i]++
      if (pos <= 20) top20[i]++
      makeCut[i]++
      sumPos[i] += pos
    }
    for (let i = 0; i < n; i++) {
      if (!madeIt[i] && !plan[i].out) sumPos[i] += m + 10
      if (plan[i].cutAlready || (plan[i].out && !plan[i].cutAlready)) sumPos[i] += m + 10
    }
  }

  return players.map((p, i) => ({
    playerId: p.id,
    win: win[i] / sims,
    top5: top5[i] / sims,
    top10: top10[i] / sims,
    top20: top20[i] / sims,
    makeCut: p.status === 'cut' || p.status === 'wd' ? 0 : makeCut[i] / sims,
    expPos: sumPos[i] / sims,
  }))
}

export function roundDifficultySummary(event) {
  const diffs = estimateRoundDifficulties(event)
  return diffs.slice(1).map((d, i) => ({ round: i + 1, fieldAvg: d }))
}

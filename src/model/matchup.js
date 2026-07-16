// 3-ball / 2-ball pricing: who shoots the lowest score of the group this
// round. Groups come from official tee times (players sharing a tee time and
// start hole are a real playing group). Scores are simulated as INTEGERS —
// ties are common in round matchups and drive the price, so a continuous
// model would misprice them. Prices are dead-heat adjusted: pDH = P(outright)
// + Σ P(tie among k)/k, so fair odds = 1/pDH and EV per unit = odds·pDH − 1
// (the standard settlement rule: tied stakes are divided).

import { ROUND_SD, roundDifficultySummary } from './simulate.js'

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

// Playing groups for the round ESPN is currently reporting.
export function deriveGroups(event) {
  const byKey = new Map()
  for (const p of event.players) {
    if (p.status !== 'active' || !p.teeTime) continue
    const key = `${p.teeTime}|${p.startHole ?? ''}`
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(p)
  }
  return [...byKey.values()]
    .filter((g) => g.length >= 2 && g.length <= 4)
    .sort((a, b) => (a[0].teeTime < b[0].teeTime ? -1 : 1))
}

// group: players from deriveGroups; skills: total skill (base + history bump)
// aligned with event.players by index. Returns per-player dead-heat win
// probability for lowest score of the group this round.
export function priceGroup(event, group, skillByPlayerId, { sims = 20000, roundAdjust = null } = {}) {
  const diffs = roundDifficultySummary(event, roundAdjust)
  const active = event.players.filter((p) => p.status === 'active')
  const fieldSkill =
    active.reduce((s, p) => s + (skillByPlayerId.get(p.id) ?? -1), 0) / Math.max(1, active.length)

  const states = group.map((p) => {
    const skill = skillByPlayerId.get(p.id) ?? -1
    const skillEdge = fieldSkill - skill
    const round = p.rounds.find((r) => r.period === p.currentRound)
    const relSoFar = p.thru > 0 ? round?.rel ?? 0 : 0
    const holesLeft = Math.max(0, 18 - p.thru)
    const frac = holesLeft / 18
    const diff = diffs[p.currentRound - 1]?.fieldAvg ?? -0.75
    return {
      base: relSoFar,
      mu: (diff + skillEdge) * frac,
      sd: ROUND_SD * Math.sqrt(frac),
      fixed: holesLeft === 0,
    }
  })

  const n = group.length
  const pDH = new Float64Array(n)
  const scores = new Array(n)
  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < n; i++) {
      const st = states[i]
      scores[i] = st.fixed ? st.base : Math.round(st.base + st.mu + st.sd * gaussian())
    }
    let best = Infinity
    for (let i = 0; i < n; i++) if (scores[i] < best) best = scores[i]
    let tied = 0
    for (let i = 0; i < n; i++) if (scores[i] === best) tied++
    for (let i = 0; i < n; i++) if (scores[i] === best) pDH[i] += 1 / tied
  }

  const settled = states.every((st) => st.fixed)
  return group.map((p, i) => ({
    playerId: p.id,
    pDH: pDH[i] / sims,
    thru: p.thru,
    relSoFar: states[i].base,
    settled,
  }))
}

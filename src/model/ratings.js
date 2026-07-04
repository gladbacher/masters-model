// Player skill ratings derived from the bundled OWGR snapshot.
//
// Skill is expressed DataGolf-style: strokes gained per round vs an average
// tour pro. OWGR points-average maps to skill roughly logarithmically —
// calibrated so the world #1 (~17 pts avg) sits near +2.6 and a fringe
// top-500 player (~0.3 pts avg) sits near -0.8. It's a proxy, not true
// strokes-gained; good enough to seed the simulator, and upgradeable later
// (DataGolf API, or ratings fitted from round-by-round results).

import owgr from '../data/owgr.json'

const SKILL_INTERCEPT = 0.2
const SKILL_SLOPE = 0.85
const UNRANKED_SKILL = -1.0

function normalizeName(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\.?$/g, '')
    .replace(/[^a-z\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// "last name + first initial" fallback key for name-format mismatches
function looseKey(name) {
  const parts = normalizeName(name).split(' ')
  if (parts.length < 2) return normalizeName(name)
  return `${parts[parts.length - 1]}|${parts[0][0]}`
}

const byName = new Map()
const byLoose = new Map()
for (const p of owgr.players) {
  byName.set(normalizeName(p.name), p)
  const k = looseKey(p.name)
  if (!byLoose.has(k)) byLoose.set(k, p)
}

export function pointsToSkill(pointsAverage) {
  const raw = SKILL_INTERCEPT + SKILL_SLOPE * Math.log(Math.max(pointsAverage, 0.05))
  return Math.min(3.0, Math.max(-1.6, raw))
}

// Returns { skill, owgrRank, matched } for an ESPN display name.
export function ratePlayer(name) {
  const hit = byName.get(normalizeName(name)) ?? byLoose.get(looseKey(name))
  if (!hit) return { skill: UNRANKED_SKILL, owgrRank: null, matched: false }
  return { skill: pointsToSkill(hit.pointsAverage), owgrRank: hit.rank, matched: true }
}

export const ratingsFetchedAt = owgr.fetchedAt

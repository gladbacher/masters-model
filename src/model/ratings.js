// Player skill ratings: strokes gained per round vs an average pro on that
// tour. Two sources, because no single one covers everybody.
//
// MEN (pga / eur / champions / liv): OWGR points-average, mapped
// logarithmically. Recalibrated 2026-07-13: the original slope (0.85, cap
// 3.0) produced win probabilities visibly flatter than major outright markets
// (Scheffler 8.9% model vs ~12-14% market at The Open). Slope 1.0 / cap 3.4
// reproduces the market's top prices while leaving mid-field ratings nearly
// unchanged. Still a proxy: no recent form, and OWGR undercounts LIV players.
//
// WOMEN (lpga): OWGR contains no women at all, and the Rolex Women's World
// Rankings are CDN-blocked to scripts. Ratings are therefore fitted directly
// from LPGA results (see scripts/build-ratings.mjs) — field-strength adjusted
// and recency weighted, so they are already on the strokes/round scale and
// need no mapping. Validated against the Rolex top 10 (July 2026): the top
// two match exactly and seven of the top twelve appear in the Rolex top ten.

import owgr from '../data/owgr.json'
import lpgaRatings from '../data/lpga-ratings.json'

const SKILL_INTERCEPT = 0.2
const SKILL_SLOPE = 1.0
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

function buildIndex(players) {
  const byName = new Map()
  const byLoose = new Map()
  for (const p of players) {
    byName.set(normalizeName(p.name), p)
    const k = looseKey(p.name)
    if (!byLoose.has(k)) byLoose.set(k, p)
  }
  return { byName, byLoose }
}

const owgrIndex = buildIndex(owgr.players)
const lpgaIndex = buildIndex(lpgaRatings.players)

export function pointsToSkill(pointsAverage) {
  const raw = SKILL_INTERCEPT + SKILL_SLOPE * Math.log(Math.max(pointsAverage, 0.05))
  return Math.min(3.4, Math.max(-1.6, raw))
}

// Tours whose players are rated from results rather than OWGR.
const RESULTS_RATED = new Set(['lpga'])

export function ratingSourceFor(tour) {
  return RESULTS_RATED.has(tour)
    ? { label: 'LPGA results', fetchedAt: lpgaRatings.fetchedAt, rankLabel: 'Rtg' }
    : { label: 'OWGR', fetchedAt: owgr.fetchedAt, rankLabel: 'OWGR' }
}

// Returns { skill, owgrRank, matched } for an ESPN display name.
export function ratePlayer(name, tour = 'pga') {
  if (RESULTS_RATED.has(tour)) {
    const hit = lpgaIndex.byName.get(normalizeName(name)) ?? lpgaIndex.byLoose.get(looseKey(name))
    if (!hit) return { skill: UNRANKED_SKILL, owgrRank: null, matched: false }
    return { skill: hit.skill, owgrRank: hit.rank, matched: true }
  }
  const hit = owgrIndex.byName.get(normalizeName(name)) ?? owgrIndex.byLoose.get(looseKey(name))
  if (!hit) return { skill: UNRANKED_SKILL, owgrRank: null, matched: false }
  return { skill: pointsToSkill(hit.pointsAverage), owgrRank: hit.rank, matched: true }
}

export const ratingsFetchedAt = owgr.fetchedAt
export const lpgaRatingsFetchedAt = lpgaRatings.fetchedAt

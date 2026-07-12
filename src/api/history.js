// Event history: how each player has performed in past editions of this
// tournament. This is the honest free-data proxy for course suitability —
// no strokes-gained splits, but repeated performance at the same venue/event
// (links form at The Open, horses-for-courses everywhere else) is one of the
// stronger public signals. Aggregates the last 3 editions from ESPN.

import { fetchCalendar, fetchEvents } from './espn'

const CACHE_KEY = 'greenbook.history.v1'
const CACHE_TTL = 6 * 86_400_000 // refresh weekly

export function normName(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) ?? {}
  } catch {
    return {}
  }
}

function eventSgVsField(event) {
  // per-player strokes/round vs the field average, for one finished edition
  const rows = []
  const perRound = []
  for (const p of event.players) {
    const roundsPlayed = p.status === 'cut' ? 2 : p.rounds.filter((r) => r.complete).length || event.roundsTotal
    const pr = p.totalRel / Math.max(1, roundsPlayed)
    perRound.push(pr)
    rows.push({ name: p.name, position: p.position, status: p.status, pr })
  }
  const fieldMean = perRound.length ? perRound.reduce((a, b) => a + b, 0) / perRound.length : 0
  return rows.map((r) => ({
    name: r.name,
    position: r.status === 'cut' ? 'MC' : r.status === 'wd' ? 'WD' : r.position,
    sg: Math.round((fieldMean - r.pr) * 100) / 100, // positive = beat the field
  }))
}

// Returns Map(normalizedName -> { finishes: ['T5','MC',...], avgSg, appearances })
export async function fetchEventHistory(tour, eventLabel, editions = 3) {
  const cacheKey = `${tour}|${eventLabel}`
  const cache = readCache()
  const hit = cache[cacheKey]
  if (hit && Date.now() - hit.ts < CACHE_TTL) return new Map(Object.entries(hit.data))

  const thisYear = new Date().getFullYear()
  const perPlayer = {}
  let found = 0
  for (let year = thisYear - 1; year >= thisYear - 5 && found < editions; year--) {
    try {
      const cal = await fetchCalendar(tour, year)
      const past = cal.find((e) => e.label === eventLabel)
      if (!past) continue
      const [ev] = await fetchEvents(tour, past.id)
      if (!ev || ev.state !== 'post' || ev.players.length < 30) continue
      found++
      for (const row of eventSgVsField(ev)) {
        const key = normName(row.name)
        perPlayer[key] ??= { finishes: [], sgs: [] }
        perPlayer[key].finishes.push(`${year}: ${row.position}`)
        perPlayer[key].sgs.push(row.sg)
      }
    } catch {
      // a missing season shouldn't break the panel
    }
  }

  const data = {}
  for (const [key, v] of Object.entries(perPlayer)) {
    data[key] = {
      finishes: v.finishes,
      appearances: v.sgs.length,
      avgSg: Math.round((v.sgs.reduce((a, b) => a + b, 0) / v.sgs.length) * 100) / 100,
    }
  }
  cache[cacheKey] = { ts: Date.now(), data }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // storage full — fine, just uncached
  }
  return new Map(Object.entries(data))
}

// Small, shrunk-toward-zero skill adjustment (strokes/round). One appearance
// counts half; capped so history can never overpower the base rating.
export function historySkillBump(hist) {
  if (!hist) return 0
  const shrink = Math.min(1, hist.appearances / 2)
  return Math.max(-0.35, Math.min(0.35, 0.3 * hist.avgSg * shrink))
}

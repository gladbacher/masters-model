// Recent-form lookup: every player's last N finishes on a tour.
//
// ESPN's API is event-centric, not player-centric, so there is no "player
// history" endpoint to call. Instead we walk back through recently completed
// events on the tour and invert them into a player -> finishes map. That is
// ~15 requests, so the result is cached; a completed event never changes, so
// the cache only needs to expire often enough to pick up new ones.

import { fetchCalendar, fetchEvents } from './espn'

const CACHE_KEY = 'greenbook.form.v1'
const CACHE_TTL = 12 * 3_600_000 // 12h — new results land at most weekly
const EVENTS_TO_SCAN = 16 // enough that a regular player has 10 starts
const CONCURRENCY = 4

export function normName(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\.?$/g, '')
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

// Numeric position for sorting/averaging. Missed cuts and withdrawals are
// deliberately NOT treated as a finishing position — they are recorded as
// events but carry no rank.
export function positionValue(pos) {
  if (pos == null) return null
  const n = parseInt(String(pos).replace(/^T/, ''), 10)
  return Number.isNaN(n) ? null : n
}

// Returns Map(normalizedName -> { finishes: [{ event, date, pos, sg }], ... })
export async function fetchRecentForm(tour, limit = 10) {
  const cache = readCache()
  const hit = cache[tour]
  if (hit && Date.now() - hit.ts < CACHE_TTL && Object.keys(hit.data ?? {}).length > 0) {
    return new Map(Object.entries(hit.data))
  }

  const cal = await fetchCalendar(tour)
  const today = new Date().toISOString().slice(0, 10)
  const past = cal
    .filter((e) => e.endDate?.slice(0, 10) < today)
    .slice(-EVENTS_TO_SCAN)
    .reverse() // most recent first

  const perEvent = []
  const queue = past.map((e, i) => ({ ...e, order: i }))
  async function worker() {
    while (queue.length) {
      const e = queue.shift()
      let ev
      try {
        ;[ev] = await fetchEvents(tour, e.id)
      } catch {
        continue
      }
      if (!ev || ev.state !== 'post') continue
      const played = ev.players.filter(
        (p) => p.status !== 'wd' && p.rounds.some((r) => r.complete),
      )
      if (played.length < 20) continue

      // strokes/round vs the field, so a finish carries strength-of-field context
      const perRound = played.map((p) => ({
        p,
        pr: p.totalRel / p.rounds.filter((r) => r.complete).length,
      }))
      const mean = perRound.reduce((s, x) => s + x.pr, 0) / perRound.length

      perEvent.push({
        order: e.order,
        label: e.label,
        date: e.startDate,
        rows: perRound.map(({ p, pr }) => ({
          key: normName(p.name),
          pos: p.status === 'cut' ? 'MC' : p.position,
          sg: Math.round((mean - pr) * 100) / 100,
        })),
      })
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  perEvent.sort((a, b) => a.order - b.order) // most recent first
  const byPlayer = {}
  for (const ev of perEvent) {
    for (const r of ev.rows) {
      byPlayer[r.key] ??= []
      if (byPlayer[r.key].length < limit) {
        byPlayer[r.key].push({ event: ev.label, date: ev.date, pos: r.pos, sg: r.sg })
      }
    }
  }

  const data = {}
  for (const [key, finishes] of Object.entries(byPlayer)) {
    const ranked = finishes.map((f) => positionValue(f.pos)).filter((v) => v != null)
    data[key] = {
      finishes,
      starts: finishes.length,
      cuts: finishes.filter((f) => f.pos === 'MC').length,
      top10s: ranked.filter((v) => v <= 10).length,
      bestPos: ranked.length ? Math.min(...ranked) : null,
      avgSg:
        finishes.length
          ? Math.round((finishes.reduce((s, f) => s + f.sg, 0) / finishes.length) * 100) / 100
          : null,
    }
  }

  // Never cache an empty result: a transient network failure would otherwise
  // poison the form column for the whole TTL.
  if (Object.keys(data).length > 0) {
    cache[tour] = { ts: Date.now(), data }
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
    } catch {
      // storage full — fine, just uncached
    }
  }
  return new Map(Object.entries(data))
}

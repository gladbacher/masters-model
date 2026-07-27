// Builds player skill ratings from actual results, for tours that OWGR does
// not cover. The women's world ranking (rolexrankings.com) is CDN-blocked to
// scripts, so for the LPGA we fit ratings directly from ESPN's own results —
// which is arguably better than a points proxy anyway: it is real
// strokes-vs-field, recency weighted, and adjusted for who was in the field.
//
// Method, per ROUND (not per event, so surviving a cut doesn't distort it):
//   perf(p, round)   = fieldMean(round) - playerScore(round)     [+ve = better]
//   fieldStrength(r) = mean rating of the players in that round
//   rating(p)        = weighted mean over rounds of perf + fieldStrength
// Iterated to convergence, recency-weighted, shrunk toward replacement level
// for small samples.
//
// Usage: npm run build-ratings [tour] [yearsBack]

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { fetchCalendar, fetchEvents } from '../src/api/espn.js'

const TOUR = process.argv[2] ?? 'lpga'
const YEARS_BACK = Number(process.argv[3] ?? 1)
const HALF_LIFE_DAYS = 270 // recency: a result 9 months old counts half
const SHRINK_ROUNDS = 20 // rounds of evidence before a rating is taken at face value
const REPLACEMENT = -1.6 // rating floor for a player with no evidence
const ITERATIONS = 15
const CONCURRENCY = 4

const OUT = join(dirname(fileURLToPath(import.meta.url)), `../src/data/${TOUR}-ratings.json`)

function normName(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---- gather completed rounds -------------------------------------------------

const thisYear = new Date().getFullYear()
const events = []
for (let y = thisYear; y >= thisYear - YEARS_BACK; y--) {
  const cal = await fetchCalendar(TOUR, y)
  for (const e of cal) events.push({ ...e, year: y })
}
console.log(`${TOUR}: ${events.length} calendar entries across ${YEARS_BACK + 1} seasons`)

const rounds = [] // { key, weight, entries: [{ name, rel }] }
const displayName = new Map()
const queue = [...events]
let done = 0

async function worker() {
  while (queue.length) {
    const e = queue.shift()
    done++
    let ev
    try {
      ;[ev] = await fetchEvents(TOUR, e.id)
    } catch {
      continue
    }
    if (!ev || ev.state !== 'post') continue

    const ageDays = (Date.now() - new Date(e.startDate).getTime()) / 86_400_000
    if (ageDays < 0) continue
    const weight = Math.pow(0.5, ageDays / HALF_LIFE_DAYS)

    // group completed rounds by period
    const byPeriod = new Map()
    for (const p of ev.players) {
      if (p.status === 'wd') continue
      for (const r of p.rounds) {
        if (!r.complete) continue
        if (!byPeriod.has(r.period)) byPeriod.set(r.period, [])
        byPeriod.get(r.period).push({ name: normName(p.name), rel: r.rel })
        displayName.set(normName(p.name), p.name)
      }
    }
    for (const [period, entries] of byPeriod) {
      if (entries.length < 20) continue // too thin to define a field mean
      rounds.push({ key: `${e.id}:${period}`, weight, entries })
    }
    if (done % 10 === 0) console.log(`  fetched ${done}/${events.length}…`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

console.log(`Usable rounds: ${rounds.length}, distinct players: ${displayName.size}`)
if (rounds.length < 40) throw new Error('Too few rounds — refusing to write a ratings file')

// ---- iterative fit -----------------------------------------------------------

// perf is fixed; only field strength changes between iterations
for (const r of rounds) {
  const mean = r.entries.reduce((s, e) => s + e.rel, 0) / r.entries.length
  for (const e of r.entries) e.perf = mean - e.rel // +ve = better than the field
}

let rating = new Map()
for (const key of displayName.keys()) rating.set(key, 0)

for (let it = 0; it < ITERATIONS; it++) {
  const num = new Map()
  const den = new Map()
  for (const r of rounds) {
    const fieldStrength =
      r.entries.reduce((s, e) => s + (rating.get(e.name) ?? 0), 0) / r.entries.length
    for (const e of r.entries) {
      // credit the player for how strong the field was that day
      const value = e.perf + fieldStrength
      num.set(e.name, (num.get(e.name) ?? 0) + value * r.weight)
      den.set(e.name, (den.get(e.name) ?? 0) + r.weight)
    }
  }
  const next = new Map()
  for (const [name, n] of num) {
    const d = den.get(name)
    const raw = n / d
    // shrink small samples toward replacement level
    const k = d / (d + SHRINK_ROUNDS / 4)
    next.set(name, raw * k + REPLACEMENT * (1 - k) * 0.35)
  }
  rating = next
}

// ---- output ------------------------------------------------------------------

const roundsPlayed = new Map()
for (const r of rounds) {
  for (const e of r.entries) roundsPlayed.set(e.name, (roundsPlayed.get(e.name) ?? 0) + 1)
}

const players = [...rating.entries()]
  .filter(([name]) => (roundsPlayed.get(name) ?? 0) >= 6)
  .map(([name, skill]) => ({
    name: displayName.get(name),
    skill: Math.round(Math.min(3.4, Math.max(-1.6, skill)) * 1000) / 1000,
    rounds: roundsPlayed.get(name),
  }))
  .sort((a, b) => b.skill - a.skill)

players.forEach((p, i) => {
  p.rank = i + 1
})

writeFileSync(
  OUT,
  JSON.stringify(
    { tour: TOUR, fetchedAt: new Date().toISOString(), method: 'results-derived', players },
    null,
    1,
  ),
)
console.log(`Wrote ${players.length} rated players to ${OUT}`)
console.log('Top 12:')
for (const p of players.slice(0, 12)) {
  console.log(`  ${String(p.rank).padStart(3)} ${p.name.padEnd(24)} ${p.skill.toFixed(2)}  (${p.rounds} rds)`)
}

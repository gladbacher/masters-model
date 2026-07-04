// Refreshes the OWGR skill-rating snapshot bundled with the app.
// OWGR's API has no CORS headers, so the browser can't call it directly —
// we snapshot it here and commit the JSON. Rankings update weekly (Mondays).
//
// Usage: npm run update-rankings

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/data/owgr.json')
const PAGE_SIZE = 100
const PAGES = 5 // top 500

async function fetchPage(page) {
  const url = `https://apiweb.owgr.com/api/owgr/rankings/getRankings?pageSize=${PAGE_SIZE}&pageNumber=${page}`
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`OWGR page ${page}: HTTP ${res.status}`)
  const data = await res.json()
  return data.rankingsList ?? []
}

const players = []
for (let page = 1; page <= PAGES; page++) {
  const list = await fetchPage(page)
  if (list.length === 0) break
  for (const row of list) {
    players.push({
      rank: row.rank,
      name: row.player.fullName,
      country: row.player.country?.code3 ?? null,
      pointsAverage: Math.round(row.pointsAverage * 10000) / 10000,
    })
  }
  console.log(`page ${page}: ${list.length} players (total ${players.length})`)
}

if (players.length < 200) throw new Error(`Only got ${players.length} players — refusing to overwrite snapshot`)

writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), players }, null, 1))
console.log(`Wrote ${players.length} players to ${OUT}`)

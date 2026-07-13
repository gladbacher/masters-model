// Live outright odds via The Odds API (the-odds-api.com). Free tier: 500
// credits/month — plenty for checking prices a few times per event. The user
// supplies their own key (stored locally, never leaves the browser except to
// The Odds API itself). Fetched on demand only, never on auto-refresh.

const KEY_STORAGE = 'greenbook.oddsapi.key'
const BASE = 'https://api.the-odds-api.com/v4'

export function getOddsKey() {
  return localStorage.getItem(KEY_STORAGE) ?? ''
}

export function setOddsKey(key) {
  if (key) localStorage.setItem(KEY_STORAGE, key.trim())
  else localStorage.removeItem(KEY_STORAGE)
}

async function listGolfSports(key) {
  const res = await fetch(`${BASE}/sports/?apiKey=${key}`)
  if (!res.ok) throw new Error(`Odds API: HTTP ${res.status}`)
  const sports = await res.json()
  return sports.filter((s) => s.group === 'Golf' && s.active)
}

function tokenize(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !['the', 'winner', 'championship', 'golf', 'tournament'].includes(w))
}

// Find the odds market matching an ESPN event name, e.g. "The Open" →
// "golf_the_open_championship_winner".
function matchSport(sports, eventName) {
  const evTokens = new Set(tokenize(eventName))
  let best = null
  let bestScore = 0
  for (const s of sports) {
    const tokens = tokenize(s.title)
    const overlap = tokens.filter((t) => evTokens.has(t)).length
    const score = overlap / Math.max(1, tokens.length)
    if (overlap > 0 && score > bestScore) {
      best = s
      bestScore = score
    }
  }
  return bestScore >= 0.5 ? best : null
}

// Returns { sportTitle, prices: Map(playerNameLower -> { best, median, books }) }
// or null when no market matches this event.
export async function fetchOutrightOdds(eventName) {
  const key = getOddsKey()
  if (!key) throw new Error('no-key')
  const sports = await listGolfSports(key)
  const sport = matchSport(sports, eventName)
  if (!sport) return null

  const res = await fetch(
    `${BASE}/sports/${sport.key}/odds/?apiKey=${key}&regions=uk,eu&markets=outrights&oddsFormat=decimal`,
  )
  if (!res.ok) throw new Error(`Odds API: HTTP ${res.status}`)
  const events = await res.json()

  const prices = new Map()
  for (const ev of events) {
    for (const book of ev.bookmakers ?? []) {
      const market = (book.markets ?? []).find((m) => m.key === 'outrights')
      for (const o of market?.outcomes ?? []) {
        const k = o.name.toLowerCase()
        const cur = prices.get(k) ?? { best: 0, bestBook: null, all: [] }
        if (o.price > cur.best) {
          cur.best = o.price
          cur.bestBook = book.title
        }
        cur.all.push(o.price)
        prices.set(k, cur)
      }
    }
  }
  for (const v of prices.values()) {
    v.all.sort((a, b) => a - b)
    v.median = v.all[Math.floor(v.all.length / 2)]
    v.books = v.all.length
    delete v.all
  }
  return { sportTitle: sport.title, prices }
}

// Match a model player to an odds outcome name (both "First Last").
export function findPrice(prices, playerName) {
  const norm = (s) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .trim()
  const n = norm(playerName)
  if (prices.has(n)) return prices.get(n)
  for (const [k, v] of prices) {
    if (norm(k) === n) return v
  }
  // last name + first initial
  const parts = n.split(/\s+/)
  const lastFirst = `${parts[parts.length - 1]}|${parts[0]?.[0] ?? ''}`
  for (const [k, v] of prices) {
    const kp = norm(k).split(/\s+/)
    if (`${kp[kp.length - 1]}|${kp[0]?.[0] ?? ''}` === lastFirst) return v
  }
  return null
}

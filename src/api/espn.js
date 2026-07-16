// ESPN's unofficial golf API. Free, no key, CORS-open (verified), covers the
// five major tours with live hole-by-hole scoring. Undocumented, so the
// normalizer below is defensive about missing fields.

export const TOURS = [
  { id: 'pga', label: 'PGA Tour' },
  { id: 'eur', label: 'DP World' },
  { id: 'lpga', label: 'LPGA' },
  { id: 'champions-tour', label: 'Champions' },
  { id: 'liv', label: 'LIV' },
]

const LEADERBOARD_URL = (tour, eventId) =>
  `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=${tour}` +
  (eventId ? `&event=${eventId}` : '')

const SCOREBOARD_URL = (tour, year) =>
  `https://site.api.espn.com/apis/site/v2/sports/golf/${tour}/scoreboard` +
  (year ? `?dates=${year}` : '')

// Season calendar: every event on the tour with its id and dates.
// Used for the look-ahead event picker and for finding past editions.
export async function fetchCalendar(tour, year = null) {
  const res = await fetch(SCOREBOARD_URL(tour, year), { cache: 'no-store' })
  if (!res.ok) throw new Error(`ESPN scoreboard: HTTP ${res.status}`)
  const data = await res.json()
  return (data.leagues?.[0]?.calendar ?? []).map((e) => ({
    id: e.id,
    label: e.label,
    startDate: e.startDate,
    endDate: e.endDate,
  }))
}

function parseRel(display) {
  if (display == null) return null
  const s = String(display).trim()
  if (s === '' || s === '-' || s === '--') return null
  if (s === 'E' || s === 'e') return 0
  const n = parseInt(s, 10)
  return Number.isNaN(n) ? null : n
}

function playerStatus(st) {
  const name = st?.type?.name ?? ''
  if (name.includes('CUT')) return 'cut'
  if (name.includes('WITHDRAWN') || name.includes('DISQUALIFIED')) return 'wd'
  return 'active'
}

// Derive course par from completed rounds where we have both strokes and
// relative score (par = strokes - relative). ESPN doesn't expose par directly.
// In-progress rounds must be excluded: their "value" is partial strokes.
function derivePar(players) {
  const votes = new Map()
  for (const p of players) {
    for (const round of p.rounds) {
      if (!round.complete || round.strokes == null || round.strokes <= 50) continue
      const par = round.strokes - round.rel
      votes.set(par, (votes.get(par) ?? 0) + 1)
    }
  }
  let best = null
  let bestCount = 0
  for (const [par, count] of votes) {
    if (count > bestCount) { best = par; bestCount = count }
  }
  return best ?? 72
}

// The true live total vs par. The competitor's `score` field only covers
// COMPLETED rounds (a player 7 under thru 17 today still shows yesterday's
// total there); the scoreToPar statistic includes the round in progress.
function liveTotalRel(c) {
  const stat = (c.statistics ?? []).find((s) => s.name === 'scoreToPar')
  if (stat) {
    const rel = parseRel(stat.displayValue)
    if (rel != null) return rel
    if (typeof stat.value === 'number') return Math.round(stat.value)
  }
  return parseRel(c.score?.displayValue ?? c.score)
}

export async function fetchEvents(tour, eventId = null) {
  const res = await fetch(LEADERBOARD_URL(tour, eventId), { cache: 'no-store' })
  if (!res.ok) throw new Error(`ESPN leaderboard: HTTP ${res.status}`)
  const data = await res.json()
  return (data.events ?? []).map((ev) => normalizeEvent(ev, tour))
}

// Current LIV roster. OWGR barely counts LIV results, so these players'
// ratings are systematically too low — the UI flags them so the model's
// number is read with appropriate suspicion. ESPN publishes no LIV fields
// via this API (verified 2026-07), so a curated snapshot (mid-2026) is the
// working source, with the dynamic fetch kept in case ESPN starts carrying
// them. Only matters where LIV players meet ranked fields: the majors.
const LIV_KEY = 'greenbook.livroster.v1'

const LIV_FALLBACK = [
  'Jon Rahm', 'Bryson DeChambeau', 'Brooks Koepka', 'Joaquin Niemann',
  'Tyrrell Hatton', 'Cameron Smith', 'Dustin Johnson', 'Patrick Reed',
  'Sergio Garcia', 'Louis Oosthuizen', 'Charl Schwartzel', 'Phil Mickelson',
  'Talor Gooch', 'Dean Burmester', 'Carlos Ortiz', 'Abraham Ancer',
  'David Puig', 'Sebastian Munoz', 'Thomas Pieters', 'Adrian Meronk',
  'Martin Kaymer', 'Lee Westwood', 'Ian Poulter', 'Henrik Stenson',
  'Kevin Na', 'Harold Varner III', 'Brendan Steele', 'Cameron Tringale',
  'Jason Kokrak', 'Anirban Lahiri', 'Richard Bland', 'Caleb Surratt',
  'Tom McKibbin', 'Lucas Herbert', 'Marc Leishman', 'Matt Jones',
  'Peter Uihlein', 'Bubba Watson', 'Mito Pereira', 'Andy Ogletree',
  'John Catlin', 'Danny Lee', 'Jinichiro Kozuma',
]

export async function fetchLivRoster() {
  const hasStorage = typeof localStorage !== 'undefined'
  if (hasStorage) {
    try {
      const cached = JSON.parse(localStorage.getItem(LIV_KEY))
      if (cached && Date.now() - cached.ts < 7 * 86_400_000) return cached.names
    } catch {
      // fall through to refetch
    }
  }
  let names = []
  const evs = await fetchEvents('liv')
  for (const ev of evs) names.push(...ev.players.map((p) => p.name))
  if (names.length === 0) {
    // between events: use the most recent completed one
    const cal = await fetchCalendar('liv')
    const today = new Date().toISOString().slice(0, 10)
    const past = [...cal].reverse().find((e) => e.startDate?.slice(0, 10) <= today)
    if (past) {
      const [ev] = await fetchEvents('liv', past.id)
      if (ev) names = ev.players.map((p) => p.name)
    }
  }
  names = [...new Set(names)]
  if (names.length === 0) return LIV_FALLBACK // don't cache: retry dynamic next visit
  if (hasStorage) {
    localStorage.setItem(LIV_KEY, JSON.stringify({ ts: Date.now(), names }))
  }
  return names
}

// Course profile from the event payload (available well before play starts).
function parseCourse(ev) {
  const c = (ev.courses ?? []).find((x) => x.host) ?? ev.courses?.[0]
  if (!c) return null
  const holes = (c.holes ?? [])
    .filter((h) => h.shotsToPar >= 3 && h.totalYards > 50)
    .map((h) => ({ number: h.number, par: h.shotsToPar, yards: h.totalYards }))
  const count = (par) => holes.filter((h) => h.par === par).length
  return {
    name: c.name ?? null,
    yards: c.totalYards ?? null,
    par: c.shotsToPar ?? null,
    par3s: count(3),
    par4s: count(4),
    par5s: count(5),
    holes,
  }
}

function normalizeEvent(ev, tour) {
  const comp = ev.competitions?.[0] ?? {}
  const competitors = comp.competitors ?? []
  const evState = ev.status?.type?.state ?? 'pre' // pre | in | post
  const roundsTotal = ev.tournament?.numberOfRounds ?? (tour === 'liv' ? 3 : 4)
  // Current round: max period reported by any player's status, else 1
  let currentRound = 1
  for (const c of competitors) {
    const p = c.status?.period
    if (p && p > currentRound && p <= roundsTotal) currentRound = p
  }
  if (evState === 'post') currentRound = roundsTotal

  // ESPN publishes the actual cut rule (e.g. top 70 + ties at The Open)
  const cutRound = ev.tournament?.cutRound ?? 0
  const cutCount = ev.tournament?.cutCount ?? 65
  const hasCut =
    cutRound > 0 && cutCount > 0
      ? true
      : tour !== 'liv' && roundsTotal >= 4 && competitors.length > 90

  const players = competitors.map((c) => {
    const st = c.status ?? {}
    const status = playerStatus(st)
    const period = st.period ?? currentRound
    const started = st.type?.state !== 'pre'
    const thru = started ? Math.min(st.thru ?? 0, 18) : 0

    // Per-round relative scores (the in-progress round carries today's rel so far)
    const rounds = []
    for (const round of c.linescores ?? []) {
      const rel = parseRel(round.displayValue)
      if (rel == null) continue
      const complete = round.period < period || (round.period === period && thru >= 18)
      rounds.push({ period: round.period, rel, strokes: round.value ?? null, complete })
    }

    const totalRel = liveTotalRel(c)

    return {
      id: c.id,
      name: c.athlete?.displayName ?? 'Unknown',
      shortName: c.athlete?.shortName ?? null,
      position: st.position?.displayName ?? '-',
      status,
      totalRel: totalRel ?? 0,
      rounds,
      currentRound: period,
      thru,
      teeTime: st.teeTime ?? null,
      startHole: st.startHole ?? 1,
      startedCurrentRound: started && thru > 0,
    }
  })

  const course = parseCourse(ev)
  const par = course?.par ?? derivePar(players)

  return {
    id: ev.id,
    tour,
    name: ev.name,
    state: evState,
    statusDetail: ev.status?.type?.description ?? '',
    date: ev.date ?? null,
    endDate: ev.endDate ?? null,
    currentRound,
    roundsTotal,
    par,
    course,
    hasCut,
    cutCount,
    cutMade: hasCut && currentRound > 2 && players.some((p) => p.status === 'cut'),
    defendingChampion: ev.defendingChampion?.athlete?.displayName ?? null,
    purse: ev.displayPurse ?? null,
    players,
  }
}

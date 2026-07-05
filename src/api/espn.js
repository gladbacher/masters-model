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

const LEADERBOARD_URL = (tour) =>
  `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=${tour}`

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

export async function fetchEvents(tour) {
  const res = await fetch(LEADERBOARD_URL(tour), { cache: 'no-store' })
  if (!res.ok) throw new Error(`ESPN leaderboard: HTTP ${res.status}`)
  const data = await res.json()
  return (data.events ?? []).map((ev) => normalizeEvent(ev, tour))
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

  const hasCut = tour !== 'liv' && roundsTotal >= 4 && competitors.length > 90

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
      startedCurrentRound: started && thru > 0,
    }
  })

  const par = derivePar(players)

  return {
    id: ev.id,
    tour,
    name: ev.name,
    state: evState,
    statusDetail: ev.status?.type?.description ?? '',
    currentRound,
    roundsTotal,
    par,
    hasCut,
    cutMade: hasCut && currentRound > 2 && players.some((p) => p.status === 'cut'),
    purse: ev.displayPurse ?? null,
    players,
  }
}

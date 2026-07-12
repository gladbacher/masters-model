// Course DNA from the hole-by-hole card: six axes, each scaled 0–1 across
// realistic tour ranges, used for the radar chart and course-similarity
// matching. Everything except wind comes straight from ESPN's course data;
// wind exposure is the location's climatology (filled in lazily).

export const AXES = [
  { key: 'length', label: 'Length', min: 6600, max: 7800, unit: 'yds (par-72 eq)' },
  { key: 'longFours', label: 'Long par 4s', min: 0, max: 0.65, unit: 'share ≥ 450yds' },
  { key: 'positional', label: 'Positional', min: 0, max: 0.55, unit: 'share of par 4s ≤ 390yds' },
  { key: 'parThrees', label: 'Par-3 test', min: 150, max: 235, unit: 'avg par-3 yds' },
  { key: 'scoring', label: 'Scoring chances', min: 0, max: 6, unit: 'reachable 5s + drivable 4s' },
  { key: 'wind', label: 'Wind exposure', min: 6, max: 22, unit: 'typical mph (climatology)' },
]

export function profileFromCourse(course) {
  const holes = course?.holes ?? []
  if (holes.length < 9) return null
  const fours = holes.filter((h) => h.par === 4)
  const threes = holes.filter((h) => h.par === 3)
  const fives = holes.filter((h) => h.par === 5)
  const avg = (a) => (a.length ? a.reduce((s, h) => s + h.yards, 0) / a.length : 0)
  const totalYards = holes.reduce((s, h) => s + h.yards, 0)
  const totalPar = holes.reduce((s, h) => s + h.par, 0)
  // normalize to par-72 equivalent so par-70 monsters compare fairly
  const effLength = totalYards + (72 - totalPar) * 115

  return {
    length: effLength,
    longFours: fours.length ? fours.filter((h) => h.yards >= 450).length / fours.length : 0,
    positional: fours.length ? fours.filter((h) => h.yards <= 390).length / fours.length : 0,
    parThrees: avg(threes),
    scoring:
      fives.filter((h) => h.yards <= 565).length + fours.filter((h) => h.yards <= 360).length,
    wind: null, // filled from climatology when available
  }
}

export function normalizeAxis(axis, value) {
  if (value == null) return null
  return Math.max(0, Math.min(1, (value - axis.min) / (axis.max - axis.min)))
}

export function normalizeProfile(profile) {
  const out = {}
  for (const axis of AXES) out[axis.key] = normalizeAxis(axis, profile?.[axis.key])
  return out
}

// 0–100: how alike two courses play. Euclidean over shared axes; wind counts
// when both sides have it.
export function similarity(profileA, profileB) {
  const a = normalizeProfile(profileA)
  const b = normalizeProfile(profileB)
  let sum = 0
  let n = 0
  for (const axis of AXES) {
    if (a[axis.key] == null || b[axis.key] == null) continue
    sum += (a[axis.key] - b[axis.key]) ** 2
    n++
  }
  if (n === 0) return 0
  const dist = Math.sqrt(sum / n)
  return Math.round((1 - dist) * 100)
}

export function formatAxisValue(axis, value) {
  if (value == null) return '—'
  switch (axis.key) {
    case 'length':
      return `${Math.round(value).toLocaleString()}`
    case 'longFours':
    case 'positional':
      return `${Math.round(value * 100)}%`
    case 'parThrees':
      return `${Math.round(value)}y`
    case 'scoring':
      return `${value}`
    case 'wind':
      return `${Math.round(value)}mph`
    default:
      return String(value)
  }
}

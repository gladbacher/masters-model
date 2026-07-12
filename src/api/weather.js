// Weather layer: geocode the course (Nominatim/OpenStreetMap, cached — their
// usage policy asks for light traffic) then fetch the forecast from
// Open-Meteo, whose best_match model is the local national service — the Met
// Office UKMO model for UK courses. Both APIs are free, keyless and CORS-open.

const GEO_CACHE_KEY = 'greenbook.geo.v1'

function geoCache() {
  try {
    return JSON.parse(localStorage.getItem(GEO_CACHE_KEY)) ?? {}
  } catch {
    return {}
  }
}

export async function geocodeCourse(courseName) {
  if (!courseName) return null
  const cache = geoCache()
  if (cache[courseName] !== undefined) return cache[courseName]

  // "Royal Birkdale GC" → "Royal Birkdale Golf Club" matches far better in OSM
  const query = courseName.replace(/\bGC\b/g, 'Golf Club').replace(/\bCC\b/g, 'Country Club')
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`
  let result = null
  try {
    const res = await fetch(url)
    if (res.ok) {
      const hits = await res.json()
      if (hits.length > 0) {
        result = {
          lat: parseFloat(hits[0].lat),
          lon: parseFloat(hits[0].lon),
          place: hits[0].display_name?.split(',').slice(1, 3).join(',').trim() ?? null,
        }
      }
    }
  } catch {
    return null // network failure: don't cache, try again next time
  }
  cache[courseName] = result // cache misses too — no point re-asking weekly
  localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache))
  return result
}

// Daily summaries for the tournament window, daytime hours only (06:00–21:00).
export async function fetchForecast(lat, lon, startDate, endDate) {
  const start = startDate.slice(0, 10)
  const end = endDate.slice(0, 10)
  // Open-Meteo forecasts max ~16 days out
  const daysAhead = (new Date(start) - Date.now()) / 86_400_000
  if (daysAhead > 15) return { tooFarOut: true, days: [] }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m` +
    `&wind_speed_unit=mph&timezone=auto&start_date=${start}&end_date=${end}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Open-Meteo: HTTP ${res.status}`)
  const data = await res.json()
  const h = data.hourly
  if (!h?.time?.length) return { tooFarOut: false, days: [] }

  const byDay = new Map()
  for (let i = 0; i < h.time.length; i++) {
    const [day, time] = h.time[i].split('T')
    const hour = parseInt(time, 10)
    if (hour < 6 || hour > 21) continue
    if (!byDay.has(day)) byDay.set(day, { winds: [], gusts: [], rain: 0, rainProb: 0, temps: [] })
    const d = byDay.get(day)
    d.winds.push(h.wind_speed_10m[i] ?? 0)
    d.gusts.push(h.wind_gusts_10m[i] ?? 0)
    d.rain += h.precipitation[i] ?? 0
    d.rainProb = Math.max(d.rainProb, h.precipitation_probability?.[i] ?? 0)
    d.temps.push(h.temperature_2m[i] ?? 0)
  }

  const days = [...byDay.entries()].map(([date, d]) => {
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
    return {
      date,
      windAvg: Math.round(avg(d.winds)),
      gustMax: Math.round(Math.max(0, ...d.gusts)),
      rainMm: Math.round(d.rain * 10) / 10,
      rainProb: d.rainProb,
      tempMin: Math.round(Math.min(...d.temps)),
      tempMax: Math.round(Math.max(...d.temps)),
    }
  })
  return { tooFarOut: false, days }
}

// Strokes added to the field's average round score by the conditions.
// Rough calibration from tour scoring studies: wind starts to bite around
// 12mph sustained, ~0.09 strokes per mph above that; sustained rain adds a
// little more. Capped — beyond ~2.5 strokes play tends to be suspended.
export function weatherAdjustment(day) {
  if (!day) return 0
  let adj = 0.09 * Math.max(0, day.windAvg - 12)
  adj += 0.02 * Math.max(0, day.gustMax - 25)
  if (day.rainMm >= 5) adj += 0.3
  return Math.min(2.5, Math.round(adj * 100) / 100)
}

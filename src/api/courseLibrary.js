// Season-wide course library: profiles every event's course so the radar can
// find look-alikes. Fetched once per season per tour (a few dozen requests,
// throttled), then cached in localStorage — course cards don't change.

import { fetchCalendar, fetchEvents } from './espn'
import { profileFromCourse } from '../model/courseProfile'

const LIB_KEY = 'greenbook.courselib.v1'
const WIND_KEY = 'greenbook.windclim.v1'

function readStore(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? {}
  } catch {
    return {}
  }
}

function writeStore(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // storage full — keep going uncached
  }
}

// onProgress(done, total) fires as profiles arrive.
export async function getSeasonCourseLibrary(tour, onProgress) {
  const store = readStore(LIB_KEY)
  const cal = await fetchCalendar(tour)
  const entries = []
  const missing = []

  for (const e of cal) {
    const cached = store[`${tour}:${e.id}`]
    if (cached !== undefined) {
      if (cached) entries.push(cached)
    } else {
      missing.push(e)
    }
  }

  let done = cal.length - missing.length
  onProgress?.(done, cal.length)

  const CONCURRENCY = 4
  const queue = [...missing]
  async function worker() {
    while (queue.length) {
      const e = queue.shift()
      let record = null
      try {
        const [ev] = await fetchEvents(tour, e.id)
        const profile = ev?.course ? profileFromCourse(ev.course) : null
        if (profile) {
          record = {
            eventId: e.id,
            label: e.label,
            courseName: ev.course.name,
            startDate: e.startDate,
            profile,
          }
        }
      } catch {
        // leave uncached so it retries next time
        continue
      }
      store[`${tour}:${e.id}`] = record // cache nulls too (no course data)
      if (record) entries.push(record)
      done++
      onProgress?.(done, cal.length)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  writeStore(LIB_KEY, store)

  entries.sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
  return entries
}

// Typical daytime wind at the course during the event's month, from last
// year's observations (Open-Meteo ERA5 archive — free, CORS-open).
export async function getWindClimatology(courseName, lat, lon, eventDate) {
  const month = (eventDate ?? new Date().toISOString()).slice(5, 7)
  const cacheKey = `${courseName}|${month}`
  const store = readStore(WIND_KEY)
  if (store[cacheKey] !== undefined) return store[cacheKey]

  const year = new Date().getFullYear() - 1
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${year}-${month}-01&end_date=${year}-${month}-28` +
    `&daily=wind_speed_10m_max&wind_speed_unit=mph`
  let value = null
  try {
    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      const winds = (data.daily?.wind_speed_10m_max ?? []).filter((w) => w != null)
      if (winds.length > 10) {
        // median daily max: robust "how windy is it here, typically"
        winds.sort((a, b) => a - b)
        value = Math.round(winds[Math.floor(winds.length / 2)] * 10) / 10
      }
    }
  } catch {
    return null // transient failure: don't cache
  }
  store[cacheKey] = value
  writeStore(WIND_KEY, store)
  return value
}

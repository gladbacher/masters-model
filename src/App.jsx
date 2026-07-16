import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TOURS, fetchEvents, fetchCalendar, fetchLivRoster } from './api/espn'
import { ratePlayer, ratingsFetchedAt } from './model/ratings'
import { simulateEvent, roundDifficultySummary } from './model/simulate'
import { geocodeCourse, fetchForecast, weatherAdjustment } from './api/weather'
import { fetchEventHistory, historySkillBump, normName } from './api/history'
import { fetchOutrightOdds, findPrice } from './api/oddsapi'
import ModelTable from './components/ModelTable'
import ValueFinder from './components/ValueFinder'
import BetTracker from './components/BetTracker'
import CoursePanel from './components/CoursePanel'
import CourseRadar from './components/CourseRadar'
import ThreeBalls from './components/ThreeBalls'
import './App.css'

const SIMS = 5000
const REFRESH_MS = 90_000

function addDays(isoDate, days) {
  const d = new Date(isoDate.slice(0, 10) + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function App() {
  const [tour, setTour] = useState('pga')
  const [selectedId, setSelectedId] = useState(null) // null = tour's current event(s)
  const [calendar, setCalendar] = useState([])
  const [events, setEvents] = useState([])
  const [eventIdx, setEventIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [tab, setTab] = useState('model')
  const [now, setNow] = useState(() => Date.now())
  const [weather, setWeather] = useState(null)
  const [history, setHistory] = useState(null)
  const [odds, setOdds] = useState(null)
  const [oddsBusy, setOddsBusy] = useState(false)
  const [oddsError, setOddsError] = useState(null)
  const [livSet, setLivSet] = useState(null)
  const lastLoadRef = useRef(0)

  // LIV roster: OWGR undercounts LIV form, so flag those players in the table
  useEffect(() => {
    let alive = true
    fetchLivRoster()
      .then((names) => alive && setLivSet(new Set(names.map(normName))))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const load = useCallback(async (t, eventId) => {
    lastLoadRef.current = Date.now()
    setLoading(true)
    setError(null)
    try {
      const evs = await fetchEvents(t, eventId)
      setEvents(evs)
      setEventIdx(0)
      setUpdatedAt(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(tour, selectedId)
  }, [tour, selectedId, load])

  useEffect(() => {
    let alive = true
    fetchCalendar(tour)
      .then((cal) => alive && setCalendar(cal))
      .catch(() => alive && setCalendar([]))
    return () => {
      alive = false
    }
  }, [tour])

  const event = events[eventIdx] ?? null

  // auto-refresh while play is live
  useEffect(() => {
    if (!event || event.state !== 'in') return undefined
    const id = setInterval(() => load(tour, selectedId), REFRESH_MS)
    return () => clearInterval(id)
  }, [event, tour, selectedId, load])

  // Browsers suspend timers in background tabs (especially on phones), so the
  // interval alone leaves returning users staring at stale data. Refetch as
  // soon as the tab is visible again, debounced against double-firing.
  useEffect(() => {
    const maybeReload = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastLoadRef.current < 15_000) return
      load(tour, selectedId)
    }
    document.addEventListener('visibilitychange', maybeReload)
    window.addEventListener('focus', maybeReload)
    return () => {
      document.removeEventListener('visibilitychange', maybeReload)
      window.removeEventListener('focus', maybeReload)
    }
  }, [tour, selectedId, load])

  // tick every 5s so the "updated Xs ago" label stays honest
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])

  // weather forecast for the course over the tournament window
  useEffect(() => {
    setWeather(null)
    if (!event?.course?.name || !event.date || event.state === 'post') return undefined
    let alive = true
    ;(async () => {
      try {
        const geo = await geocodeCourse(event.course.name)
        if (!geo || !alive) return
        const fc = await fetchForecast(geo.lat, geo.lon, event.date, event.endDate ?? event.date)
        if (alive) setWeather({ geo, ...fc })
      } catch {
        // weather is optional; never break the model over it
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id])

  // event history (last 3 editions) for course suitability
  useEffect(() => {
    setHistory(null)
    if (!event || event.state === 'post') return undefined
    let alive = true
    fetchEventHistory(tour, event.name)
      .then((h) => alive && setHistory(h))
      .catch(() => {})
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id])

  // odds reset when the event changes
  useEffect(() => {
    setOdds(null)
    setOddsError(null)
  }, [event?.id])

  const loadOdds = useCallback(async () => {
    if (!event) return
    setOddsBusy(true)
    setOddsError(null)
    try {
      const result = await fetchOutrightOdds(event.name)
      if (!result) setOddsError('No odds market found for this event')
      else setOdds(result)
    } catch (e) {
      setOddsError(e.message === 'no-key' ? 'Enter an Odds API key first' : e.message)
    } finally {
      setOddsBusy(false)
    }
  }, [event])

  // per-round weather adjustment (only applied to rounds with no live data)
  const roundAdjust = useMemo(() => {
    if (!event || !weather?.days?.length) return null
    return Array.from({ length: event.roundsTotal }, (_, i) => {
      const day = weather.days.find((d) => d.date === addDays(event.date, i))
      return weatherAdjustment(day)
    })
  }, [event, weather])

  const model = useMemo(() => {
    if (!event || event.players.length === 0) return null
    const ratings = event.players.map((p) => ratePlayer(p.name))
    const hists = event.players.map((p) => history?.get(normName(p.name)) ?? null)
    const bumps = hists.map(historySkillBump)
    const skills = ratings.map((r, i) => r.skill + bumps[i])
    const { results, cutProjection } = simulateEvent(event, skills, { sims: SIMS, roundAdjust })
    const rows = event.players.map((p, i) => {
      const price = odds ? findPrice(odds.prices, p.name) : null
      return {
        ...p,
        ...ratings[i],
        hist: hists[i],
        histBump: bumps[i],
        ...results[i],
        marketOdds: price?.best ?? null,
        marketBook: price?.bestBook ?? null,
        marketBooks: price?.books ?? 0,
        liv: livSet?.has(normName(p.name)) ?? false,
      }
    })
    rows.sort((a, b) => b.win - a.win)
    const matched = ratings.filter((r) => r.matched).length
    return {
      rows,
      matched,
      cutProjection,
      difficulties: roundDifficultySummary(event, roundAdjust),
    }
  }, [event, history, roundAdjust, odds, livSet])

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const currentIds = new Set(events.map((e) => e.id))
    return calendar
      .filter((e) => e.endDate?.slice(0, 10) >= today && !currentIds.has(e.id))
      .slice(0, 10)
  }, [calendar, events])

  const pickerValue = selectedId ? `cal:${selectedId}` : `cur:${eventIdx}`
  const onPick = (v) => {
    if (v.startsWith('cal:')) setSelectedId(v.slice(4))
    else {
      setSelectedId(null)
      setEventIdx(Number(v.slice(4)))
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">⛳</span>
          <h1>Green Book</h1>
          <span className="tagline">live tournament model</span>
        </div>
        <nav className="tours">
          {TOURS.map((t) => (
            <button
              key={t.id}
              className={t.id === tour ? 'active' : ''}
              onClick={() => {
                setSelectedId(null)
                setTour(t.id)
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <div className="banner error">
          Failed to load ESPN data: {error}{' '}
          <button onClick={() => load(tour, selectedId)}>Retry</button>
        </div>
      )}

      {event && (
        <div className="event-header">
          <div>
            <h2>{event.name}</h2>
            <div className="event-meta">
              <span className={`pill state-${event.state}`}>{event.statusDetail}</span>
              {event.state !== 'pre' && <span>R{event.currentRound}/{event.roundsTotal}</span>}
              {event.state === 'pre' && event.date && (
                <span>starts {new Date(event.date).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              )}
              <span>Par {event.par}</span>
              {event.purse && <span>{event.purse}</span>}
              {event.players.length > 0 && <span>{event.players.length} players</span>}
              {model && (
                <span title="players matched to an OWGR rating">
                  {model.matched}/{event.players.length} rated
                </span>
              )}
            </div>
          </div>
          <div className="event-actions">
            <select value={pickerValue} onChange={(e) => onPick(e.target.value)}>
              <optgroup label="Now">
                {selectedId && <option value={`cal:${selectedId}`}>{event.name}</option>}
                {events.length > 0 && !selectedId
                  ? events.map((ev, i) => (
                      <option key={ev.id} value={`cur:${i}`}>{ev.name}</option>
                    ))
                  : !selectedId && <option value="cur:0">Current event</option>}
                {selectedId && <option value="cur:0">← Back to current event</option>}
              </optgroup>
              <optgroup label="Upcoming">
                {upcoming.map((e) => (
                  <option key={e.id} value={`cal:${e.id}`}>
                    {e.label} · {e.startDate.slice(5, 10)}
                  </option>
                ))}
              </optgroup>
            </select>
            <button onClick={() => load(tour, selectedId)} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            {updatedAt && (
              <span className={`updated ${now - updatedAt.getTime() > 240_000 && event.state === 'in' ? 'stale' : ''}`}>
                updated {formatAgo(now - updatedAt.getTime())} · {SIMS.toLocaleString()} sims
                {event.state === 'in' ? ' · auto 90s' : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {event && (event.course || weather) && (
        <CoursePanel event={event} weather={weather} roundAdjust={roundAdjust} />
      )}

      {event && model && event.state !== 'pre' && (
        <div className="round-diffs">
          {model.difficulties.map((d) => (
            <span key={d.round} className={d.round === event.currentRound ? 'current' : ''}>
              R{d.round}: field {d.fieldAvg > 0 ? '+' : ''}{d.fieldAvg.toFixed(1)}
            </span>
          ))}
        </div>
      )}

      {event && model?.cutProjection && (
        <CutProjection event={event} projection={model.cutProjection} />
      )}

      <nav className="tabs">
        <button className={tab === 'model' ? 'active' : ''} onClick={() => setTab('model')}>
          Model
        </button>
        <button className={tab === '3balls' ? 'active' : ''} onClick={() => setTab('3balls')}>
          3-balls
        </button>
        <button className={tab === 'radar' ? 'active' : ''} onClick={() => setTab('radar')}>
          Course radar
        </button>
        <button className={tab === 'value' ? 'active' : ''} onClick={() => setTab('value')}>
          Value finder
        </button>
        <button className={tab === 'tracker' ? 'active' : ''} onClick={() => setTab('tracker')}>
          Bet tracker
        </button>
        <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>
          How it works
        </button>
      </nav>

      {loading && !event && <div className="banner">Loading tournament data…</div>}

      {event && event.players.length === 0 && tab === 'model' && (
        <div className="banner">
          Field not published yet — ESPN usually lists entries once tee times are set
          (Mon–Wed of tournament week). Course profile and weather above are live now;
          the model kicks in automatically when the field appears.
        </div>
      )}

      {event && model && tab === 'model' && (
        <ModelTable
          event={event}
          rows={model.rows}
          odds={odds}
          oddsBusy={oddsBusy}
          oddsError={oddsError}
          onLoadOdds={loadOdds}
        />
      )}
      {event && model && tab === '3balls' && (
        <ThreeBalls event={event} rows={model.rows} roundAdjust={roundAdjust} />
      )}
      {event && tab === 'radar' && (
        <CourseRadar event={event} tour={tour} rows={model?.rows ?? null} />
      )}
      {event && model && tab === 'value' && <ValueFinder rows={model.rows} event={event} />}
      {tab === 'tracker' && <BetTracker />}
      {tab === 'notes' && <Notes />}

      <footer>
        Data: ESPN (live scoring) + OWGR snapshot ({new Date(ratingsFetchedAt).toLocaleDateString()})
        + Open-Meteo/Met Office models (weather) + OpenStreetMap (geocoding).
        Model estimates, not advice. Bet responsibly — begambleaware.org
      </footer>
    </div>
  )
}

function fmtLine(rel) {
  if (rel === 0) return 'E'
  return rel > 0 ? `+${rel}` : `${rel}`
}

function CutProjection({ event, projection }) {
  // provisional line: where the cut would fall on current scores
  const active = event.players
    .filter((p) => p.status === 'active')
    .map((p) => p.totalRel)
    .sort((a, b) => a - b)
  const provisional = active[Math.min(event.cutCount - 1, active.length - 1)]
  const inside = active.filter((t) => t <= provisional).length
  return (
    <div className="cut-proj">
      <span className="cut-title">Cut projection (top {event.cutCount} + ties):</span>
      <span className="strong-inline">{fmtLine(projection.median)}</span>
      <span className="dim">
        68% range {fmtLine(projection.lo)} to {fmtLine(projection.hi)}
      </span>
      {event.state === 'in' && provisional != null && (
        <span className="dim">
          · line on current scores: {fmtLine(provisional)} ({inside} inside)
        </span>
      )}
    </div>
  )
}

function formatAgo(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  return `${m}m ago`
}

function Notes() {
  return (
    <div className="notes">
      <h3>The model</h3>
      <p>
        Every player gets a skill rating (strokes per round vs an average tour pro), derived
        from OWGR points-average, nudged by their record in the last three editions of the
        event (the Hist column — capped at ±0.35 strokes). The tournament is then simulated
        5,000 times: each remaining round is drawn from a normal distribution around
        <em> course difficulty + player skill</em>, with the event's actual cut rule applied.
      </p>
      <h3>Look-ahead & weather</h3>
      <p>
        Pick any upcoming event from the dropdown to see its course profile, forecast and
        model. Weather comes from the local national forecast model (the Met Office model
        for UK courses) at the course's exact location; sustained wind above ~12mph adds to
        expected scoring (~0.09 strokes per mph) for rounds that haven't started. Forecasts
        open up 16 days out.
      </p>
      <h3>In-play</h3>
      <p>
        In-play, known scores are locked in and only the remaining holes are simulated —
        including the unfinished part of the current round, scaled by holes left. Course
        difficulty is re-estimated live from what the field is actually shooting, so scoring
        conditions feed straight into the probabilities. Refreshes every 90 seconds during play.
      </p>
      <h3>Finding value</h3>
      <p>
        Add a free key from the-odds-api.com to pull live outright prices into the table
        (best price across UK/EU books, with the model's edge). Or paste any bookmaker's
        prices into the Value finder. Demand a big margin (15%+ relative edge) and stake at
        quarter-Kelly or less.
      </p>
      <h3>Proving the edge</h3>
      <p>
        Log every flagged bet (paper bets first) to the Bet tracker, then fill in the closing
        odds when the market shuts. Consistently positive CLV — beating the closing line —
        over 30+ bets is the green light to bet real money and pay for better data; results
        alone are too noisy to tell you anything for months.
      </p>
      <h3>Known limitations</h3>
      <ul>
        <li>
          Skill is an OWGR proxy — no strokes-gained splits or recent-form weighting. The
          curve is calibrated so favorites' win probabilities match major outright markets
          (July 2026); in-form players still rate low until a form blend is added.
        </li>
        <li>LIV players (flagged) are underrated — OWGR barely counts LIV results.</li>
        <li>Event history is a coarse course-fit signal; for rota events (The Open) it spans venues.</li>
        <li>Weather adjusts scoring difficulty but not tee-time waves yet (no draw until Wed).</li>
        <li>No player-specific variance (bombers vs plodders spread differently).</li>
      </ul>
    </div>
  )
}

export default App

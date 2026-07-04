import { useCallback, useEffect, useMemo, useState } from 'react'
import { TOURS, fetchEvents } from './api/espn'
import { ratePlayer, ratingsFetchedAt } from './model/ratings'
import { simulateEvent, roundDifficultySummary } from './model/simulate'
import ModelTable from './components/ModelTable'
import ValueFinder from './components/ValueFinder'
import BetTracker from './components/BetTracker'
import './App.css'

const SIMS = 5000
const REFRESH_MS = 90_000

function App() {
  const [tour, setTour] = useState('pga')
  const [events, setEvents] = useState([])
  const [eventIdx, setEventIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [tab, setTab] = useState('model')

  const load = useCallback(async (t) => {
    setLoading(true)
    setError(null)
    try {
      const evs = await fetchEvents(t)
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
    load(tour)
  }, [tour, load])

  const event = events[eventIdx] ?? null

  // auto-refresh while play is live
  useEffect(() => {
    if (!event || event.state !== 'in') return undefined
    const id = setInterval(() => load(tour), REFRESH_MS)
    return () => clearInterval(id)
  }, [event, tour, load])

  const model = useMemo(() => {
    if (!event) return null
    const ratings = event.players.map((p) => ratePlayer(p.name))
    const skills = ratings.map((r) => r.skill)
    const sim = simulateEvent(event, skills, { sims: SIMS })
    const rows = event.players.map((p, i) => ({ ...p, ...ratings[i], ...sim[i] }))
    rows.sort((a, b) => b.win - a.win)
    const matched = ratings.filter((r) => r.matched).length
    return { rows, matched, difficulties: roundDifficultySummary(event) }
  }, [event])

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
              onClick={() => setTour(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <div className="banner error">
          Failed to load ESPN data: {error}{' '}
          <button onClick={() => load(tour)}>Retry</button>
        </div>
      )}

      {event && (
        <div className="event-header">
          <div>
            <h2>{event.name}</h2>
            <div className="event-meta">
              <span className={`pill state-${event.state}`}>{event.statusDetail}</span>
              <span>R{event.currentRound}/{event.roundsTotal}</span>
              <span>Par {event.par}</span>
              {event.purse && <span>{event.purse}</span>}
              <span>{event.players.length} players</span>
              {model && (
                <span title="players matched to an OWGR rating">
                  {model.matched}/{event.players.length} rated
                </span>
              )}
            </div>
          </div>
          <div className="event-actions">
            {events.length > 1 && (
              <select value={eventIdx} onChange={(e) => setEventIdx(Number(e.target.value))}>
                {events.map((ev, i) => (
                  <option key={ev.id} value={i}>{ev.name}</option>
                ))}
              </select>
            )}
            <button onClick={() => load(tour)} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            {updatedAt && (
              <span className="updated">
                {updatedAt.toLocaleTimeString()} · {SIMS.toLocaleString()} sims
                {event.state === 'in' ? ' · auto 90s' : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {event && model && (
        <div className="round-diffs">
          {model.difficulties.map((d) => (
            <span key={d.round} className={d.round === event.currentRound ? 'current' : ''}>
              R{d.round}: field {d.fieldAvg > 0 ? '+' : ''}{d.fieldAvg.toFixed(1)}
            </span>
          ))}
        </div>
      )}

      <nav className="tabs">
        <button className={tab === 'model' ? 'active' : ''} onClick={() => setTab('model')}>
          Model
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

      {event && model && tab === 'model' && <ModelTable event={event} rows={model.rows} />}
      {event && model && tab === 'value' && <ValueFinder rows={model.rows} event={event} />}
      {tab === 'tracker' && <BetTracker />}
      {tab === 'notes' && <Notes />}

      <footer>
        Data: ESPN (live scoring) + OWGR snapshot ({new Date(ratingsFetchedAt).toLocaleDateString()}).
        Model estimates, not advice. Bet responsibly — begambleaware.org
      </footer>
    </div>
  )
}

function Notes() {
  return (
    <div className="notes">
      <h3>The model</h3>
      <p>
        Every player gets a skill rating (strokes per round vs an average tour pro), derived
        from OWGR points-average. The tournament is then simulated 5,000 times: each remaining
        round is drawn from a normal distribution around <em>course difficulty + player skill</em>,
        with the cut applied after round 2 where relevant.
      </p>
      <h3>In-play</h3>
      <p>
        In-play, known scores are locked in and only the remaining holes are simulated —
        including the unfinished part of the current round, scaled by holes left. Course
        difficulty is re-estimated live from what the field is actually shooting, so scoring
        conditions (wind, pins) feed straight into the probabilities. Refreshes every 90
        seconds during play.
      </p>
      <h3>Finding value</h3>
      <p>
        Paste bookmaker prices into the Value finder. A bet is value when the model probability
        beats the market's implied probability by a real margin. Given this model's simplicity,
        demand a big margin (15%+ relative edge) and stake at quarter-Kelly or less.
      </p>
      <h3>Proving the edge</h3>
      <p>
        Log every flagged bet (paper bets first) to the Bet tracker, then fill in the closing
        odds when the market shuts. Consistently positive CLV — beating the closing line —
        over 30+ bets is the green light to bet real money and pay for better data; results
        alone are too noisy to tell you anything for months.
      </p>
      <h3>Known limitations (v1)</h3>
      <ul>
        <li>Skill is an OWGR proxy — no strokes-gained splits, course fit, or recent-form weighting.</li>
        <li>No player-specific variance (bombers vs plodders spread differently).</li>
        <li>Cut is approximated as top-65-and-ties; no-cut signature events may be misflagged.</li>
        <li>No weather-wave (AM/PM draw) modelling yet.</li>
      </ul>
    </div>
  )
}

export default App

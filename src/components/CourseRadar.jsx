import { useEffect, useMemo, useState } from 'react'
import { AXES, profileFromCourse, normalizeAxis, similarity, formatAxisValue } from '../model/courseProfile'
import { getSeasonCourseLibrary, getWindClimatology } from '../api/courseLibrary'
import { geocodeCourse } from '../api/weather'
import { fetchEventHistory, normName } from '../api/history'
import { formatPct } from '../model/betting'

// series colors validated for CVD + contrast on the dark surface
const COLOR_SELF = '#059669'
const COLOR_OVERLAY = '#6366f1'

function polar(cx, cy, r, angle) {
  return [cx + r * Math.sin(angle), cy - r * Math.cos(angle)]
}

function Radar({ axes, self, overlay, selfName, overlayName }) {
  const width = 460
  const height = 350
  const cx = width / 2
  const cy = height / 2 + 4
  const R = 112
  const n = axes.length
  const angle = (i) => (i * 2 * Math.PI) / n

  const ring = (level) =>
    axes.map((_, i) => polar(cx, cy, R * level, angle(i)).join(',')).join(' ')

  const poly = (values) =>
    axes
      .map((a, i) => polar(cx, cy, R * Math.max(0.02, values[a.key] ?? 0), angle(i)).join(','))
      .join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="radar" role="img" aria-label="Course profile radar">
      {[0.25, 0.5, 0.75, 1].map((l) => (
        <polygon key={l} points={ring(l)} className="radar-grid" />
      ))}
      {axes.map((a, i) => {
        const [x, y] = polar(cx, cy, R, angle(i))
        const [lx, ly] = polar(cx, cy, R + 22, angle(i))
        return (
          <g key={a.key}>
            <line x1={cx} y1={cy} x2={x} y2={y} className="radar-grid" />
            <text
              x={lx}
              y={ly}
              className="radar-label"
              textAnchor={Math.abs(lx - cx) < 12 ? 'middle' : lx > cx ? 'start' : 'end'}
            >
              {a.label}
            </text>
          </g>
        )
      })}
      {overlay && (
        <polygon
          points={poly(overlay)}
          fill={COLOR_OVERLAY}
          fillOpacity="0.14"
          stroke={COLOR_OVERLAY}
          strokeWidth="2"
          strokeDasharray="5 4"
        />
      )}
      <polygon points={poly(self)} fill={COLOR_SELF} fillOpacity="0.2" stroke={COLOR_SELF} strokeWidth="2" />
      {axes.map((a, i) => {
        const v = self[a.key]
        if (v == null) return null
        const [x, y] = polar(cx, cy, R * Math.max(0.02, v), angle(i))
        return (
          <circle key={a.key} cx={x} cy={y} r="3.5" fill={COLOR_SELF}>
            <title>{`${selfName} — ${a.label}`}</title>
          </circle>
        )
      })}
      {overlay &&
        axes.map((a, i) => {
          const v = overlay[a.key]
          if (v == null) return null
          const [x, y] = polar(cx, cy, R * Math.max(0.02, v), angle(i))
          return (
            <circle key={a.key} cx={x} cy={y} r="3" fill={COLOR_OVERLAY}>
              <title>{`${overlayName} — ${a.label}`}</title>
            </circle>
          )
        })}
    </svg>
  )
}

export default function CourseRadar({ event, tour, rows }) {
  const [library, setLibrary] = useState({ list: [], done: 0, total: 0, ready: false })
  const [overlayId, setOverlayId] = useState(null)
  const [wind, setWind] = useState(null)
  const [fit, setFit] = useState(null)

  const selfProfile = useMemo(() => {
    const p = event.course ? profileFromCourse(event.course) : null
    return p ? { ...p, wind } : null
  }, [event.course, wind])

  // season library (cached after first run)
  useEffect(() => {
    let alive = true
    getSeasonCourseLibrary(tour, (done, total) => {
      if (alive) setLibrary((s) => ({ ...s, done, total }))
    })
      .then((list) => alive && setLibrary({ list, done: list.length, total: list.length, ready: true }))
      .catch(() => alive && setLibrary((s) => ({ ...s, ready: true })))
    return () => {
      alive = false
    }
  }, [tour])

  // wind climatology for this course
  useEffect(() => {
    setWind(null)
    if (!event.course?.name) return undefined
    let alive = true
    ;(async () => {
      const geo = await geocodeCourse(event.course.name)
      if (!geo || !alive) return
      const w = await getWindClimatology(event.course.name, geo.lat, geo.lon, event.date)
      if (alive) setWind(w)
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id])

  const ranked = useMemo(() => {
    if (!selfProfile || !library.ready) return []
    return library.list
      .filter((e) => e.label !== event.name && e.courseName !== event.course?.name)
      .map((e) => ({ ...e, sim: similarity(selfProfile, e.profile) }))
      .sort((a, b) => b.sim - a.sim)
  }, [selfProfile, library, event])

  const overlay = overlayId
    ? ranked.find((e) => e.eventId === overlayId) ?? null
    : ranked[0] ?? null

  // course-fit ranking: this event's history + the 3 most similar events'
  useEffect(() => {
    setFit(null)
    if (!ranked.length) return undefined
    let alive = true
    ;(async () => {
      const sources = [
        { label: event.name, weight: 1.5 },
        ...ranked.slice(0, 3).map((e) => ({ label: e.label, weight: e.sim / 100 })),
      ]
      const merged = new Map()
      for (const src of sources) {
        try {
          const hist = await fetchEventHistory(tour, src.label)
          for (const [key, rec] of hist) {
            const cur = merged.get(key) ?? { name: rec.name ?? key, w: 0, sg: 0, apps: 0 }
            const w = src.weight * rec.appearances
            cur.w += w
            cur.sg += rec.avgSg * w
            cur.apps += rec.appearances
            if (rec.name) cur.name = rec.name
            merged.set(key, cur)
          }
        } catch {
          // skip a failed source
        }
      }
      if (!alive) return
      const fieldNames = rows ? new Set(rows.map((r) => normName(r.name))) : null
      const winByName = rows ? new Map(rows.map((r) => [normName(r.name), r.win])) : null
      const list = [...merged.entries()]
        .map(([key, v]) => ({
          key,
          name: v.name,
          fitSg: Math.round((v.sg / Math.max(v.w, 0.01)) * 100) / 100,
          apps: v.apps,
          inField: fieldNames ? fieldNames.has(key) : null,
          win: winByName?.get(key) ?? null,
        }))
        .filter((p) => p.apps >= 2)
        .sort((a, b) => b.fitSg - a.fitSg)
      setFit(list.slice(0, 15))
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranked.length > 0 ? ranked[0].eventId : null, event.id])

  if (!selfProfile) {
    return (
      <div className="banner">
        No hole-by-hole course data published for this event yet — the radar appears as soon
        as ESPN lists the course card.
      </div>
    )
  }

  const axes = AXES.filter((a) => selfProfile[a.key] != null)
  const selfNorm = {}
  const overlayNorm = overlay ? {} : null
  for (const a of axes) {
    selfNorm[a.key] = normalizeAxis(a, selfProfile[a.key])
    if (overlay) overlayNorm[a.key] = normalizeAxis(a, overlay.profile[a.key])
  }

  return (
    <div className="radar-panel">
      <div className="radar-main">
        <div className="radar-chart">
          <Radar
            axes={axes}
            self={selfNorm}
            overlay={overlayNorm}
            selfName={event.course.name}
            overlayName={overlay?.courseName}
          />
          <div className="radar-legend">
            <span>
              <i className="swatch" style={{ background: COLOR_SELF }} /> {event.course.name}
            </span>
            {overlay && (
              <span>
                <i className="swatch dashed" style={{ background: COLOR_OVERLAY }} />{' '}
                {overlay.courseName} ({overlay.label}) · {overlay.sim}% similar
              </span>
            )}
          </div>
          {!library.ready && library.total > 0 && (
            <div className="radar-progress">
              Profiling season courses… {library.done}/{library.total}
            </div>
          )}
        </div>

        <div className="radar-side">
          <table className="axis-table">
            <thead>
              <tr>
                <th className="left">Axis</th>
                <th>{event.course.name?.split(' ').slice(0, 2).join(' ')}</th>
                {overlay && <th>{overlay.courseName?.split(' ').slice(0, 2).join(' ')}</th>}
              </tr>
            </thead>
            <tbody>
              {axes.map((a) => (
                <tr key={a.key}>
                  <td className="left" title={a.unit}>
                    {a.label}
                  </td>
                  <td>{formatAxisValue(a, selfProfile[a.key])}</td>
                  {overlay && <td className="dim">{formatAxisValue(a, overlay.profile[a.key])}</td>}
                </tr>
              ))}
            </tbody>
          </table>

          {ranked.length > 0 && (
            <div className="similar-list">
              <div className="side-title">Most similar this season</div>
              {ranked.slice(0, 5).map((e) => (
                <button
                  key={e.eventId}
                  className={`chip ${overlay?.eventId === e.eventId ? 'active' : ''}`}
                  onClick={() => setOverlayId(e.eventId)}
                  title={e.courseName}
                >
                  {e.label} · {e.sim}%
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="fit-panel">
        <div className="side-title">
          Course-fit leaders
          <span className="side-sub">
            {' '}
            — record at this event (weighted) + the 3 most similar courses, strokes/round vs
            field. Display only; the model's Hist column uses this event alone.
          </span>
        </div>
        {!fit && <div className="dim">Crunching past editions…</div>}
        {fit && fit.length === 0 && <div className="dim">Not enough history yet.</div>}
        {fit && fit.length > 0 && (
          <table>
            <thead>
              <tr>
                <th className="left">Player</th>
                <th>Fit (sg/rd)</th>
                <th>Rounds of evidence</th>
                {rows && <th>In field</th>}
                {rows && <th>Model win</th>}
              </tr>
            </thead>
            <tbody>
              {fit.map((p) => (
                <tr key={p.key} className={p.inField === false ? 'out' : ''}>
                  <td className="left name">{p.name}</td>
                  <td className={p.fitSg > 0 ? 'strong' : 'under'}>
                    {p.fitSg >= 0 ? '+' : ''}
                    {p.fitSg.toFixed(2)}
                  </td>
                  <td className="dim">{p.apps} editions</td>
                  {rows && <td className="dim">{p.inField ? '✓' : '—'}</td>}
                  {rows && (
                    <td className="dim">{p.win != null && p.win >= 0.0005 ? formatPct(p.win) : '—'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

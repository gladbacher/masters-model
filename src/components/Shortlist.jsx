import { useEffect, useMemo, useState } from 'react'
import { profileFromCourse, similarity } from '../model/courseProfile'
import { getSeasonCourseLibrary } from '../api/courseLibrary'
import { buildCourseFit } from '../api/courseFit'
import { normName } from '../api/form'
import { courseCommentary } from '../model/commentary'
import { buildShortlist } from '../model/shortlist'
import { formatPct } from '../model/betting'

function FormStrip({ finishes }) {
  if (!finishes?.length) return <span className="dim">no recent starts</span>
  return (
    <span className="form-strip">
      {finishes.map((f, i) => {
        const n = parseInt(String(f.pos).replace(/^T/, ''), 10)
        const cls = f.pos === 'MC' ? 'mc' : n === 1 ? 'win' : n <= 10 ? 'top10' : n <= 25 ? 'top25' : ''
        return (
          <span key={i} className={`fchip ${cls}`} title={`${f.event}${f.date ? ` — ${new Date(f.date).toLocaleDateString()}` : ''}`}>
            {f.pos}
          </span>
        )
      })}
    </span>
  )
}

export default function Shortlist({ event, tour, rows, wind }) {
  const [fit, setFit] = useState(null)
  const [similar, setSimilar] = useState([])
  const [busy, setBusy] = useState(true)

  const commentary = useMemo(() => courseCommentary(event.course, wind), [event.course, wind])
  const selfProfile = useMemo(
    () => (event.course ? profileFromCourse(event.course) : null),
    [event.course],
  )

  // find comparable courses, then build the fit table
  useEffect(() => {
    let alive = true
    setBusy(true)
    setFit(null)
    if (!selfProfile) {
      setBusy(false)
      return undefined
    }
    ;(async () => {
      let ranked = []
      try {
        const lib = await getSeasonCourseLibrary(tour)
        ranked = lib
          .filter((e) => e.label !== event.name && e.courseName !== event.course?.name)
          .map((e) => ({ ...e, sim: similarity(selfProfile, e.profile) }))
          .sort((a, b) => b.sim - a.sim)
      } catch {
        // fall through with no comps — event history alone still works
      }
      if (!alive) return
      setSimilar(ranked.slice(0, 4))
      try {
        const f = await buildCourseFit(tour, event, ranked)
        if (alive) setFit(f)
      } catch {
        if (alive) setFit([])
      }
      if (alive) setBusy(false)
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, tour, selfProfile])

  const result = useMemo(() => {
    if (!fit || !rows?.length) return null
    const byKey = new Map(rows.map((r) => [normName(r.name), r]))
    const formMap = new Map(
      rows.filter((r) => r.form).map((r) => [normName(r.name), r.form]),
    )
    const entries = fit
      .filter((f) => byKey.has(f.key))
      .map((f) => {
        const r = byKey.get(f.key)
        return {
          id: r.id,
          name: r.name,
          fit: f.fit,
          apps: f.apps,
          detail: f.detail,
          win: r.win,
          top10: r.top10,
          owgrRank: r.owgrRank,
          liv: r.liv,
        }
      })
    return buildShortlist(entries, formMap, normName)
  }, [fit, rows])

  return (
    <div className="shortlist-page">
      {commentary && (
        <section className="commentary">
          <h3>Course read — {event.course?.name}</h3>
          <p className="archetype">{commentary.archetype}</p>
          <ul className="points">
            {commentary.points.map((p, i) => (
              <li key={i}>
                <span className="ctag">{p.tag}</span> {p.text}
              </li>
            ))}
          </ul>
          {commentary.demands.length > 0 && (
            <p className="demands">
              <strong>What it rewards:</strong> {commentary.demands.join(' · ')}
            </p>
          )}
          {similar.length > 0 && (
            <p className="dim comps">
              Closest comparable courses: {similar.map((s) => `${s.label} (${s.sim}%)`).join(', ')}
            </p>
          )}
        </section>
      )}

      {busy && <div className="banner">Building course-fit history…</div>}

      {!busy && !rows?.length && (
        <div className="banner">Field not published yet — the shortlist appears once entries are listed.</div>
      )}

      {result?.picks?.length > 0 && (
        <section>
          <h3>Shortlist — 8 who suit this course</h3>
          <p className="dim sl-note">
            Ranked on course-type record, corroborated by current form and the model.
            Players badly out of form are excluded regardless of course history.
          </p>
          <div className="picks">
            {result.picks.map((p, i) => (
              <div key={p.id ?? p.name} className="pick">
                <div className="pick-head">
                  <span className="pick-rank">{i + 1}</span>
                  <span className="pick-name">
                    {p.name}
                    {p.liv && <span className="liv-badge">LIV</span>}
                  </span>
                  <span className="pick-stats">
                    fit <b>{p.fit >= 0 ? '+' : ''}{p.fit.toFixed(2)}</b>
                    {p.form?.avgSg != null && (
                      <> · form <b>{p.form.avgSg >= 0 ? '+' : ''}{p.form.avgSg.toFixed(2)}</b></>
                    )}
                    {p.win > 0.0005 && <> · model <b>{formatPct(p.win)}</b></>}
                  </span>
                </div>
                <div className="pick-reason">{p.reason}</div>
                <div className="pick-form">
                  <span className="dim">Last {p.recent.length}:</span> <FormStrip finishes={p.recent} />
                </div>
                {p.evidence.length > 0 && (
                  <div className="pick-evidence dim">{p.evidence.join(' · ')}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {result?.excluded?.length > 0 && (
        <section className="excluded">
          <h3>Fits the course, but left off</h3>
          {result.excluded.map((p) => (
            <div key={p.id ?? p.name} className="pick muted">
              <div className="pick-head">
                <span className="pick-name">{p.name}</span>
              </div>
              <div className="pick-reason">{p.reason}</div>
              <div className="pick-form">
                <FormStrip finishes={(p.form?.finishes ?? []).slice(0, 10)} />
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

export { FormStrip }

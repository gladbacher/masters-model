import { useState } from 'react'
import { fairOdds, formatOdds, formatPct } from '../model/betting'

function fmtRel(rel) {
  if (rel === 0) return 'E'
  return rel > 0 ? `+${rel}` : `${rel}`
}

function thruLabel(p, event) {
  if (p.status === 'cut') return 'CUT'
  if (p.status === 'wd') return 'WD'
  if (event.state === 'pre') return '—'
  if (p.thru >= 18) return `F (R${p.currentRound})`
  if (p.thru > 0) return `thru ${p.thru}`
  if (p.teeTime) {
    const d = new Date(p.teeTime)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return '—'
}

export default function ModelTable({ event, rows }) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  const q = query.trim().toLowerCase()
  let visible = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows
  if (!q && !showAll) visible = visible.slice(0, 40)

  const preCut = event.hasCut && !event.cutMade && event.currentRound <= 2

  return (
    <div className="table-wrap">
      <div className="table-controls">
        <input
          placeholder="Search player…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!q && rows.length > 40 && (
          <button onClick={() => setShowAll((s) => !s)}>
            {showAll ? 'Top 40' : `All ${rows.length}`}
          </button>
        )}
      </div>
      <table>
        <thead>
          <tr>
            <th>Pos</th>
            <th className="left">Player</th>
            <th>Total</th>
            <th>Thru</th>
            <th>OWGR</th>
            <th>Win</th>
            <th>Fair</th>
            <th>Top 5</th>
            <th>Top 10</th>
            <th>Top 20</th>
            {preCut && <th>Cut</th>}
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.id} className={r.status !== 'active' ? 'out' : ''}>
              <td>{r.position}</td>
              <td className="left name">
                {r.name}
                {!r.matched && r.status === 'active' && (
                  <span className="unrated" title="No OWGR match — default fringe rating">
                    ?
                  </span>
                )}
              </td>
              <td className={r.totalRel < 0 ? 'under' : ''}>{fmtRel(r.totalRel)}</td>
              <td className="dim">{thruLabel(r, event)}</td>
              <td className="dim">{r.owgrRank ?? '—'}</td>
              <td className="strong">{r.win >= 0.0005 ? formatPct(r.win) : '—'}</td>
              <td className="dim">{r.win >= 0.0005 ? formatOdds(fairOdds(r.win)) : '—'}</td>
              <td>{formatPct(r.top5)}</td>
              <td>{formatPct(r.top10)}</td>
              <td>{formatPct(r.top20)}</td>
              {preCut && <td>{formatPct(r.makeCut, 0)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

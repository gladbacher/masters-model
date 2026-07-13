import { useState } from 'react'
import { fairOdds, formatOdds, formatPct } from '../model/betting'
import { getOddsKey, setOddsKey } from '../api/oddsapi'

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

function posNum(pos) {
  const n = parseInt(String(pos).replace(/^T/, ''), 10)
  return Number.isNaN(n) ? 999 : n
}

export default function ModelTable({ event, rows, odds, oddsBusy, oddsError, onLoadOdds }) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [sort, setSort] = useState({ key: 'win', dir: -1 })
  const [keyDraft, setKeyDraft] = useState('')
  const [hasKey, setHasKey] = useState(() => !!getOddsKey())

  const preCut = event.hasCut && !event.cutMade && event.currentRound <= 2
  const pre = event.state === 'pre'

  const edge = (r) => (r.marketOdds && r.win > 0 ? r.win * r.marketOdds - 1 : null)

  const columns = [
    { key: 'pos', label: 'Pos', get: (r) => posNum(r.position), show: !pre },
    { key: 'name', label: 'Player', get: (r) => r.name, left: true },
    { key: 'total', label: 'Total', get: (r) => r.totalRel, show: !pre },
    { key: 'thru', label: 'Thru', get: (r) => r.thru, show: !pre },
    { key: 'owgr', label: 'OWGR', get: (r) => r.owgrRank ?? 9999 },
    { key: 'hist', label: 'Hist', get: (r) => r.histBump },
    { key: 'win', label: 'Win', get: (r) => r.win },
    { key: 'fair', label: 'Fair', get: (r) => r.win },
    { key: 'odds', label: 'Best', get: (r) => r.marketOdds ?? 0, show: !!odds },
    { key: 'edge', label: 'Edge', get: (r) => edge(r) ?? -9, show: !!odds },
    { key: 'top5', label: 'Top 5', get: (r) => r.top5 },
    { key: 'top10', label: 'Top 10', get: (r) => r.top10 },
    { key: 'top20', label: 'Top 20', get: (r) => r.top20 },
    { key: 'cut', label: 'Cut', get: (r) => r.makeCut, show: preCut },
  ].filter((c) => c.show !== false)

  const sortCol = columns.find((c) => c.key === sort.key) ?? columns.find((c) => c.key === 'win')
  const sorted = [...rows].sort((a, b) => {
    const av = sortCol.get(a)
    const bv = sortCol.get(b)
    if (typeof av === 'string') return sort.dir * av.localeCompare(bv)
    return sort.dir * (av - bv)
  })

  const q = query.trim().toLowerCase()
  let visible = q ? sorted.filter((r) => r.name.toLowerCase().includes(q)) : sorted
  if (!q && !showAll) visible = visible.slice(0, 40)

  const clickSort = (key) => {
    setSort((s) =>
      s.key === key
        ? { key, dir: -s.dir }
        : { key, dir: key === 'name' || key === 'pos' || key === 'owgr' || key === 'fair' ? 1 : -1 },
    )
  }

  const saveKey = () => {
    setOddsKey(keyDraft)
    setHasKey(!!keyDraft)
    setKeyDraft('')
  }

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
        <span className="spacer" />
        {!hasKey ? (
          <span className="odds-setup">
            <input
              placeholder="Odds API key (free at the-odds-api.com)"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              size={32}
            />
            <button onClick={saveKey} disabled={!keyDraft.trim()}>Save</button>
          </span>
        ) : odds ? (
          <span className="odds-info">
            {odds.sportTitle}: {odds.prices.size} priced ·{' '}
            <button className="linkish" onClick={onLoadOdds}>refresh</button>
          </span>
        ) : (
          <span className="odds-setup">
            <button onClick={onLoadOdds} disabled={oddsBusy}>
              {oddsBusy ? 'Loading…' : 'Load live odds'}
            </button>
            <button
              className="linkish"
              title="Remove stored key"
              onClick={() => {
                setOddsKey('')
                setHasKey(false)
              }}
            >
              clear key
            </button>
          </span>
        )}
      </div>
      {oddsError && <div className="banner warn">⚠ {oddsError}</div>}
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`${c.left ? 'left ' : ''}sortable`}
                onClick={() => clickSort(c.key)}
                title="Click to sort"
              >
                {c.label}
                {sort.key === c.key ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => {
            const e = edge(r)
            return (
              <tr key={r.id} className={r.status !== 'active' ? 'out' : e != null && e > 0.05 ? 'value-yes' : ''}>
                {!pre && <td>{r.position}</td>}
                <td className="left name">
                  {r.name}
                  {!r.matched && r.status === 'active' && (
                    <span className="unrated" title="No OWGR match — default fringe rating">
                      ?
                    </span>
                  )}
                  {r.liv && (
                    <span
                      className="liv-badge"
                      title="LIV player — OWGR undercounts LIV form, so the model likely underrates them"
                    >
                      LIV
                    </span>
                  )}
                </td>
                {!pre && <td className={r.totalRel < 0 ? 'under' : ''}>{fmtRel(r.totalRel)}</td>}
                {!pre && <td className="dim">{thruLabel(r, event)}</td>}
                <td className="dim">{r.owgrRank ?? '—'}</td>
                <td
                  className={r.histBump > 0.05 ? 'strong' : r.histBump < -0.05 ? 'under' : 'dim'}
                  title={r.hist ? r.hist.finishes.join('\n') : 'No appearances in last editions'}
                >
                  {r.hist ? `${r.histBump >= 0 ? '+' : ''}${r.histBump.toFixed(1)} (${r.hist.appearances})` : '—'}
                </td>
                <td className="strong">{r.win >= 0.0005 ? formatPct(r.win) : '—'}</td>
                <td className="dim">{r.win >= 0.0005 ? formatOdds(fairOdds(r.win)) : '—'}</td>
                {odds && (
                  <td title={r.marketOdds ? `Best of ${r.marketBooks} book${r.marketBooks === 1 ? '' : 's'}` : undefined}>
                    {r.marketOdds ? (
                      <>
                        {formatOdds(r.marketOdds)}{' '}
                        {r.marketBook && <span className="book">{r.marketBook}</span>}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                )}
                {odds && (
                  <td className={e != null && e > 0.05 ? 'strong' : 'dim'}>
                    {e != null ? `${e >= 0 ? '+' : ''}${(e * 100).toFixed(0)}%` : '—'}
                  </td>
                )}
                <td>{formatPct(r.top5)}</td>
                <td>{formatPct(r.top10)}</td>
                <td>{formatPct(r.top20)}</td>
                {preCut && <td>{formatPct(r.makeCut, 0)}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

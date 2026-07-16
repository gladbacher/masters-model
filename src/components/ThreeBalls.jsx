import { useMemo, useState } from 'react'
import { deriveGroups, priceGroup } from '../model/matchup'
import { parseOdds, formatOdds, formatPct } from '../model/betting'
import { addBet } from '../model/tracker'

function teeLabel(teeTime) {
  const d = new Date(teeTime)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function GroupCard({ group, priced, rows, onLog, logged }) {
  const [oddsText, setOddsText] = useState({})

  return (
    <div className={`group-card ${priced[0]?.settled ? 'settled' : ''}`}>
      <div className="group-head">
        <span className="dim">
          {teeLabel(group[0].teeTime)}
          {group[0].startHole > 1 ? ` · hole ${group[0].startHole}` : ''} · R{group[0].currentRound}
        </span>
        {priced[0]?.settled && <span className="pill">round complete</span>}
      </div>
      <table>
        <tbody>
          {group.map((p, i) => {
            const pr = priced[i]
            const row = rows?.find((r) => r.id === p.id)
            const odds = parseOdds(oddsText[p.id] ?? '')
            const ev = odds ? odds * pr.pDH - 1 : null
            const key = `${p.id}|3ball|${odds ?? ''}`
            return (
              <tr key={p.id} className={ev != null && ev > 0.05 ? 'value-yes' : ''}>
                <td className="left name">
                  {p.name}
                  {row?.liv && <span className="liv-badge">LIV</span>}
                </td>
                <td className="dim">
                  {p.thru >= 18 ? `F ${pr.relSoFar > 0 ? '+' : ''}${pr.relSoFar}` : p.thru > 0 ? `${pr.relSoFar > 0 ? '+' : ''}${pr.relSoFar} thru ${p.thru}` : 'not started'}
                </td>
                <td className="strong">{formatPct(pr.pDH)}</td>
                <td className="dim">{pr.pDH > 0.0005 ? formatOdds(1 / pr.pDH) : '—'}</td>
                <td>
                  <input
                    className="cell-input"
                    placeholder="odds"
                    value={oddsText[p.id] ?? ''}
                    onChange={(e) => setOddsText((s) => ({ ...s, [p.id]: e.target.value }))}
                    disabled={pr.settled}
                  />
                </td>
                <td className={ev != null && ev > 0.05 ? 'strong' : 'dim'}>
                  {ev != null ? `${ev >= 0 ? '+' : ''}${(ev * 100).toFixed(0)}%` : '—'}
                </td>
                <td>
                  {odds && !pr.settled ? (
                    logged.has(key) ? (
                      <span className="logged">✓</span>
                    ) : (
                      <button onClick={() => onLog(p, odds, pr.pDH, key)}>Log</button>
                    )
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function ThreeBalls({ event, rows, roundAdjust }) {
  const [query, setQuery] = useState('')
  const [logged, setLogged] = useState(() => new Set())

  const skillByPlayerId = useMemo(() => {
    const m = new Map()
    for (const r of rows ?? []) m.set(r.id, r.skill + (r.histBump ?? 0))
    return m
  }, [rows])

  const groups = useMemo(() => deriveGroups(event), [event])

  const priced = useMemo(
    () => groups.map((g) => priceGroup(event, g, skillByPlayerId, { roundAdjust })),
    [groups, event, skillByPlayerId, roundAdjust],
  )

  const onLog = (p, odds, pDH, key) => {
    addBet({
      event: event.name,
      tour: event.tour,
      player: `${p.name} (3-ball R${p.currentRound})`,
      market: '3ball',
      odds,
      modelProb: Math.round(pDH * 10000) / 10000,
      stake: 1,
    })
    window.dispatchEvent(new Event('greenbook:bets-changed'))
    setLogged((s) => new Set(s).add(key))
  }

  if (groups.length === 0) {
    return (
      <div className="banner">
        No playing groups available — tee times for the next round usually appear the evening
        before. Groups are derived from official tee times once ESPN publishes them.
      </div>
    )
  }

  const q = query.trim().toLowerCase()
  const visible = q
    ? groups.filter((g) => g.some((p) => p.name.toLowerCase().includes(q)))
    : groups

  return (
    <div className="threeballs">
      <div className="table-controls">
        <input placeholder="Find a player's group…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="dim tb-note">
          Lowest score of the group this round · integer-score simulation · prices are
          dead-heat adjusted (fair = 1/pDH). Enter a bookmaker price to see the edge.
        </span>
      </div>
      <div className="group-grid">
        {visible.map((g) => {
          const idx = groups.indexOf(g)
          return (
            <GroupCard
              key={`${g[0].teeTime}|${g[0].startHole}`}
              group={g}
              priced={priced[idx]}
              rows={rows}
              onLog={onLog}
              logged={logged}
            />
          )
        })}
      </div>
    </div>
  )
}

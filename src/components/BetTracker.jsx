import { useEffect, useState } from 'react'
import { loadBets, updateBet, deleteBet, summarize, clv, toCsv } from '../model/tracker'
import { formatOdds, formatPct } from '../model/betting'

const MARKET_LABELS = {
  win: 'Winner',
  top5: 'Top 5',
  top10: 'Top 10',
  top20: 'Top 20',
  makeCut: 'Make cut',
}

function Stat({ label, value, tone }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${tone ?? ''}`}>{value}</span>
    </div>
  )
}

export default function BetTracker() {
  const [bets, setBets] = useState(loadBets)

  // pick up bets logged from the Value finder tab
  useEffect(() => {
    const onChange = () => setBets(loadBets())
    window.addEventListener('greenbook:bets-changed', onChange)
    return () => window.removeEventListener('greenbook:bets-changed', onChange)
  }, [])

  const s = summarize(bets)

  const setClosing = (id, text) => {
    const v = parseFloat(text)
    setBets(updateBet(id, { closingOdds: Number.isFinite(v) && v > 1 ? v : null }))
  }

  const exportCsv = () => {
    const blob = new Blob([toCsv(bets)], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `greenbook-bets-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (bets.length === 0) {
    return (
      <div className="notes">
        <h3>No bets logged yet</h3>
        <p>
          Log bets from the Value finder tab (real or paper — paper is the right way to
          start). Then come back here, fill in the closing odds when the market shuts,
          and mark results. The average CLV figure is the number that decides whether
          this model earns a data budget.
        </p>
      </div>
    )
  }

  return (
    <div className="tracker">
      <div className="stats">
        <Stat label="Bets" value={`${s.count} (${s.pending} open)`} />
        <Stat label="Record" value={`${s.won}-${s.lost}`} />
        <Stat
          label="P/L"
          value={s.staked > 0 ? `${s.pl >= 0 ? '+' : ''}${s.pl.toFixed(2)}` : '—'}
          tone={s.pl > 0 ? 'good' : s.pl < 0 ? 'bad' : ''}
        />
        <Stat
          label="ROI"
          value={s.roi != null ? formatPct(s.roi) : '—'}
          tone={s.roi > 0 ? 'good' : s.roi < 0 ? 'bad' : ''}
        />
        <Stat
          label={`Avg CLV (${s.clvCount})`}
          value={s.avgClv != null ? formatPct(s.avgClv) : '—'}
          tone={s.avgClv > 0 ? 'good' : s.avgClv < 0 ? 'bad' : ''}
        />
        <button onClick={exportCsv}>Export CSV</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="left">Date</th>
              <th className="left">Event</th>
              <th className="left">Player</th>
              <th>Market</th>
              <th>Taken</th>
              <th>Model</th>
              <th>Stake</th>
              <th>Close</th>
              <th>CLV</th>
              <th>Result</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bets.map((b) => {
              const c = clv(b)
              return (
                <tr key={b.id}>
                  <td className="left dim">{new Date(b.ts).toLocaleDateString()}</td>
                  <td className="left dim">{b.event}</td>
                  <td className="left name">{b.player}</td>
                  <td>{MARKET_LABELS[b.market] ?? b.market}</td>
                  <td>{formatOdds(b.odds)}</td>
                  <td className="dim">{formatPct(b.modelProb)}</td>
                  <td>{b.stake}</td>
                  <td>
                    <input
                      className="cell-input"
                      type="number"
                      step="0.1"
                      min="1.01"
                      placeholder="—"
                      value={b.closingOdds ?? ''}
                      onChange={(e) => setClosing(b.id, e.target.value)}
                    />
                  </td>
                  <td className={c == null ? 'dim' : c > 0 ? 'strong' : 'under'}>
                    {c == null ? '—' : formatPct(c)}
                  </td>
                  <td>
                    <select
                      value={b.result}
                      onChange={(e) => setBets(updateBet(b.id, { result: e.target.value }))}
                    >
                      <option value="pending">open</option>
                      <option value="won">won</option>
                      <option value="lost">lost</option>
                      <option value="void">void</option>
                    </select>
                  </td>
                  <td>
                    <button
                      className="danger"
                      title="Delete bet"
                      onClick={() => setBets(deleteBet(b.id))}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Enter the last available odds before the market closed (or the player teed off) in
        “Close”. Positive average CLV over 30+ bets = the model is finding real value;
        negative = stop betting and fix the model.
      </p>
    </div>
  )
}

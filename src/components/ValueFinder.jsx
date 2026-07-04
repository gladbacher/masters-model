import { useMemo, useState } from 'react'
import { ev, impliedProb, kelly, parseOdds, fairOdds, formatOdds, formatPct } from '../model/betting'
import { addBet } from '../model/tracker'

const MARKETS = [
  { id: 'win', label: 'Winner' },
  { id: 'top5', label: 'Top 5' },
  { id: 'top10', label: 'Top 10' },
  { id: 'top20', label: 'Top 20' },
  { id: 'makeCut', label: 'Make cut' },
]

function norm(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchPlayer(nameText, rows) {
  const n = norm(nameText)
  if (!n) return null
  let hit = rows.find((r) => norm(r.name) === n)
  if (hit) return hit
  // all words of input appear in player name (handles "Scheffler" or "S Scheffler")
  const words = n.split(' ')
  const candidates = rows.filter((r) => {
    const rn = norm(r.name)
    return words.every((w) => rn.includes(w))
  })
  return candidates.length === 1 ? candidates[0] : null
}

// Lines like: "Scottie Scheffler 4.5", "Rahm 11/2", "McIlroy +650"
function parseLines(text, rows) {
  const out = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/[\t,;]+/g, ' ').trim()
    if (!line) continue
    const m = line.match(/^(.*?)\s+([+-]?\d[\d./]*)$/)
    if (!m) {
      out.push({ raw: line, error: 'no odds found' })
      continue
    }
    const odds = parseOdds(m[2])
    if (!odds) {
      out.push({ raw: line, error: `bad odds "${m[2]}"` })
      continue
    }
    const player = matchPlayer(m[1], rows)
    if (!player) {
      out.push({ raw: line, error: `no match for "${m[1].trim()}"` })
      continue
    }
    out.push({ raw: line, player, odds })
  }
  return out
}

export default function ValueFinder({ rows, event }) {
  const [text, setText] = useState('')
  const [market, setMarket] = useState('win')
  const [bankroll, setBankroll] = useState(1000)
  const [logged, setLogged] = useState(() => new Set())

  const logBet = (b, stake) => {
    addBet({
      event: event.name,
      tour: event.tour,
      player: b.player.name,
      market,
      odds: b.odds,
      modelProb: Math.round(b.prob * 10000) / 10000,
      stake,
    })
    window.dispatchEvent(new Event('greenbook:bets-changed'))
    setLogged((s) => new Set(s).add(`${b.player.id}|${market}|${b.odds}`))
  }

  const parsed = useMemo(() => parseLines(text, rows), [text, rows])
  const bets = parsed
    .filter((p) => p.player)
    .map((p) => {
      const prob = p.player[market]
      return {
        ...p,
        prob,
        fair: fairOdds(prob),
        implied: impliedProb(p.odds),
        ev: ev(prob, p.odds),
        kelly: kelly(prob, p.odds),
      }
    })
    .sort((a, b) => b.ev - a.ev)
  const errors = parsed.filter((p) => p.error)

  return (
    <div className="value-finder">
      <div className="vf-inputs">
        <textarea
          rows={8}
          placeholder={'Paste prices, one per line:\nScottie Scheffler 4.5\nRahm 11/2\nMcIlroy +650'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="vf-controls">
          <label>
            Market
            <select value={market} onChange={(e) => setMarket(e.target.value)}>
              {MARKETS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </label>
          <label>
            Bankroll
            <input
              type="number"
              min="0"
              value={bankroll}
              onChange={(e) => setBankroll(Number(e.target.value))}
            />
          </label>
          <p className="hint">
            Stakes shown at ¼ Kelly. Only bet when edge is large — the model is a proxy, and
            small edges are usually model error, not value.
          </p>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="banner warn">
          {errors.map((e, i) => (
            <div key={i}>⚠ {e.raw} — {e.error}</div>
          ))}
        </div>
      )}

      {bets.length > 0 && (
        <table>
          <thead>
            <tr>
              <th className="left">Player</th>
              <th>Model</th>
              <th>Fair</th>
              <th>Market</th>
              <th>Implied</th>
              <th>Edge</th>
              <th>EV / unit</th>
              <th>¼ Kelly stake</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bets.map((b, i) => {
              const stake = b.kelly > 0 ? Number(((b.kelly / 4) * bankroll).toFixed(0)) : 0
              const key = `${b.player.id}|${market}|${b.odds}`
              return (
                <tr key={i} className={b.ev > 0.03 ? 'value-yes' : b.ev < 0 ? 'value-no' : ''}>
                  <td className="left name">{b.player.name}</td>
                  <td>{formatPct(b.prob)}</td>
                  <td>{formatOdds(b.fair)}</td>
                  <td>{formatOdds(b.odds)}</td>
                  <td>{formatPct(b.implied)}</td>
                  <td className="strong">
                    {b.implied > 0 ? `${((b.prob / b.implied - 1) * 100).toFixed(0)}%` : '—'}
                  </td>
                  <td>{b.ev >= 0 ? '+' : ''}{b.ev.toFixed(3)}</td>
                  <td>{stake > 0 ? stake : '—'}</td>
                  <td>
                    {logged.has(key) ? (
                      <span className="logged">✓</span>
                    ) : (
                      <button
                        title="Log to bet tracker"
                        onClick={() => logBet(b, stake > 0 ? stake : 1)}
                      >
                        Log
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

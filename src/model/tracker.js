// Bet log persisted in localStorage. The point is CLV (closing line value):
// record the price you took and the price at close — beating the close
// consistently is the real test of the model, long before results converge.

const KEY = 'greenbook.bets.v1'

export function loadBets() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? []
  } catch {
    return []
  }
}

function persist(bets) {
  localStorage.setItem(KEY, JSON.stringify(bets))
  return bets
}

export function addBet(bet) {
  const bets = loadBets()
  bets.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: new Date().toISOString(),
    closingOdds: null,
    result: 'pending', // pending | won | lost | void
    ...bet,
  })
  return persist(bets)
}

export function updateBet(id, patch) {
  return persist(loadBets().map((b) => (b.id === id ? { ...b, ...patch } : b)))
}

export function deleteBet(id) {
  return persist(loadBets().filter((b) => b.id !== id))
}

// CLV of one bet: how much better your price was than the close.
// +5% means you beat the close by 5% — the market moved your way.
export function clv(bet) {
  if (!bet.closingOdds || bet.closingOdds <= 1) return null
  return bet.odds / bet.closingOdds - 1
}

export function summarize(bets) {
  const settled = bets.filter((b) => b.result === 'won' || b.result === 'lost')
  const staked = settled.reduce((s, b) => s + b.stake, 0)
  const returned = settled.reduce((s, b) => s + (b.result === 'won' ? b.stake * b.odds : 0), 0)
  const withClv = bets.map(clv).filter((v) => v != null)
  return {
    count: bets.length,
    pending: bets.filter((b) => b.result === 'pending').length,
    won: settled.filter((b) => b.result === 'won').length,
    lost: settled.filter((b) => b.result === 'lost').length,
    staked,
    pl: returned - staked,
    roi: staked > 0 ? (returned - staked) / staked : null,
    avgClv: withClv.length ? withClv.reduce((a, b) => a + b, 0) / withClv.length : null,
    clvCount: withClv.length,
  }
}

export function toCsv(bets) {
  const cols = ['ts', 'event', 'tour', 'player', 'market', 'odds', 'modelProb', 'stake', 'closingOdds', 'result']
  const rows = bets.map((b) =>
    cols.map((c) => {
      const v = b[c] ?? ''
      return /[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : v
    }).join(','),
  )
  return [cols.join(','), ...rows].join('\n')
}

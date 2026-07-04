// Odds/staking math for comparing model probabilities against market prices.

export function fairOdds(p) {
  if (p <= 0) return null
  return 1 / p
}

// Accepts "4.5", "9/2", "+450"
export function parseOdds(text) {
  const s = String(text).trim()
  if (/^[+-]\d+$/.test(s)) {
    const a = parseInt(s, 10)
    return a > 0 ? 1 + a / 100 : 1 + 100 / -a
  }
  const frac = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/)
  if (frac) return 1 + parseFloat(frac[1]) / parseFloat(frac[2])
  const dec = parseFloat(s)
  return Number.isFinite(dec) && dec > 1 ? dec : null
}

export function impliedProb(decimalOdds) {
  return 1 / decimalOdds
}

// Expected value per 1 unit staked
export function ev(p, decimalOdds) {
  return p * (decimalOdds - 1) - (1 - p)
}

// Full Kelly fraction of bankroll (clamped at 0). Stake fractional Kelly of
// this in practice — model error makes full Kelly reckless.
export function kelly(p, decimalOdds) {
  const b = decimalOdds - 1
  if (b <= 0) return 0
  return Math.max(0, (p * b - (1 - p)) / b)
}

export function formatOdds(decimal) {
  if (decimal == null) return '-'
  if (decimal >= 100) return decimal.toFixed(0)
  if (decimal >= 10) return decimal.toFixed(1)
  return decimal.toFixed(2)
}

export function formatPct(p, digits = 1) {
  return `${(p * 100).toFixed(digits)}%`
}

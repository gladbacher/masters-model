// Builds an 8-player shortlist for the week, with a written justification for
// each pick — the same reasoning applied by hand for the Wyndham and LIV
// shortlists, made repeatable.
//
// Three independent signals, deliberately kept separate so a pick can be
// explained rather than just scored:
//   fit    strokes/round vs field at this event and the most similar courses
//   form   strokes/round vs field over the last ~10 starts
//   model  the simulator's win probability (skill rating + course difficulty)
//
// Form is a filter as much as an input: a strong course record from a player
// who is currently missing cuts is a trap, so anyone badly out of form is
// excluded and surfaced separately rather than silently ranked down.

const SHORTLIST_SIZE = 8
const FORM_FLOOR = -0.35 // strokes/round vs field, below this = out of form

function z(values, v) {
  if (v == null || values.length < 3) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const sd = Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length) || 1
  return (v - mean) / sd
}

function fitPhrase(fit, apps) {
  if (fit >= 2.0) return `outstanding record on this course type (+${fit.toFixed(2)} strokes/round over ${apps} relevant starts)`
  if (fit >= 1.2) return `strong record on comparable courses (+${fit.toFixed(2)} strokes/round, ${apps} starts)`
  if (fit >= 0.5) return `solid history on this profile (+${fit.toFixed(2)} strokes/round)`
  return `modest course-type record (${fit >= 0 ? '+' : ''}${fit.toFixed(2)} strokes/round)`
}

function formPhrase(form) {
  const { avgSg, finishes = [], top10s = 0, starts = 0, cuts = 0 } = form ?? {}
  if (avgSg == null) return 'no recent form data'
  const recent = finishes.slice(0, 3).map((f) => f.pos).join(', ')
  if (avgSg >= 1.5) return `in excellent form (+${avgSg.toFixed(2)} strokes/round, ${top10s} top-10s in ${starts}; last three: ${recent})`
  if (avgSg >= 0.6) return `playing well (+${avgSg.toFixed(2)} strokes/round; last three: ${recent})`
  if (avgSg >= 0) return `steady rather than sharp (+${avgSg.toFixed(2)} strokes/round, ${cuts} missed cuts in ${starts})`
  return `out of form (${avgSg.toFixed(2)} strokes/round, ${cuts} missed cuts in ${starts})`
}

function priceNote(win, fitRank) {
  if (win >= 0.08) return 'The model already rates him a clear favourite, so expect a short price — this is a confidence pick rather than a value one.'
  if (win >= 0.03) return 'Sits in the model\'s front rank without being the obvious favourite.'
  if (fitRank <= 5) return 'The combination of a genuine course profile and a long price is where value is most likely to sit.'
  return 'A longer shot whose profile fits better than his ranking suggests.'
}

// entries: [{ id, name, fit, apps, detail, win, top5, top10, owgrRank, liv }]
// formMap: Map(normName -> form record)
export function buildShortlist(entries, formMap, normName, { size = SHORTLIST_SIZE } = {}) {
  const usable = entries.filter((e) => e.apps >= 2)
  if (usable.length < 3) return null

  const fits = usable.map((e) => e.fit)
  const wins = usable.map((e) => e.win)

  const scored = usable.map((e) => {
    const form = formMap?.get(normName(e.name)) ?? null
    const forms = usable
      .map((x) => formMap?.get(normName(x.name))?.avgSg)
      .filter((v) => v != null)
    return {
      ...e,
      form,
      // fit carries the most weight (this is a course-fit shortlist), with
      // form and the model as corroboration
      score: 1.0 * z(fits, e.fit) + 0.7 * z(forms, form?.avgSg) + 0.6 * z(wins, e.win),
      outOfForm: form?.avgSg != null && form.avgSg < FORM_FLOOR,
    }
  })

  const byFit = [...scored].sort((a, b) => b.fit - a.fit)
  const fitRank = new Map(byFit.map((e, i) => [e.id ?? e.name, i + 1]))

  const eligible = scored.filter((e) => !e.outOfForm).sort((a, b) => b.score - a.score)
  const picks = eligible.slice(0, size).map((e) => {
    const fr = fitRank.get(e.id ?? e.name)
    const bits = [
      `${fitPhrase(e.fit, e.apps)}`,
      `${formPhrase(e.form)}`,
    ]
    return {
      ...e,
      fitRank: fr,
      reason: `${bits.join('; ')}. ${priceNote(e.win, fr)}`,
      evidence: (e.detail ?? []).slice(0, 4),
      recent: (e.form?.finishes ?? []).slice(0, 10),
    }
  })

  // players the fit model likes but current form rules out — worth naming
  const excluded = scored
    .filter((e) => e.outOfForm && e.fit >= 1.0)
    .sort((a, b) => b.fit - a.fit)
    .slice(0, 3)
    .map((e) => ({
      ...e,
      reason: `Fit says yes (+${e.fit.toFixed(2)} strokes/round over ${e.apps} starts) but ${formPhrase(e.form)} — course knowledge without a game to use it.`,
    }))

  return { picks, excluded }
}

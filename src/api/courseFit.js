// Course fit: how well each player has historically scored on courses that
// play like this week's. Shared by the Course radar and the weekly shortlist.
//
// Fit blends this event's own history (weighted highest) with the most
// similar courses on the tour, each weighted by its similarity score. It is
// expressed in strokes per round vs the field, so it is comparable across
// events. Editions played before a recorded renovation are excluded by
// fetchEventHistory's minYear.

import { fetchEventHistory, normName } from './history'

export async function buildCourseFit(tour, event, similarEvents, { comps = 3 } = {}) {
  const minYear = event.course?.override?.historyValidFrom ?? null
  const sources = [
    { label: event.name, weight: 1.5, minYear },
    ...similarEvents.slice(0, comps).map((e) => ({
      label: e.label,
      weight: e.sim / 100,
      minYear: null,
    })),
  ]

  const merged = new Map()
  for (const src of sources) {
    let hist
    try {
      hist = await fetchEventHistory(tour, src.label, 3, src.minYear)
    } catch {
      continue // a missing source shouldn't kill the panel
    }
    for (const [key, rec] of hist) {
      const cur = merged.get(key) ?? { name: rec.name ?? key, w: 0, sg: 0, apps: 0, detail: [] }
      const w = src.weight * rec.appearances
      cur.w += w
      cur.sg += rec.avgSg * w
      cur.apps += rec.appearances
      if (rec.name) cur.name = rec.name
      for (const f of rec.finishes ?? []) {
        cur.detail.push(`${src.label.replace(/^(The|LIV Golf) /, '')} ${f}`)
      }
      merged.set(key, cur)
    }
  }

  return [...merged.entries()]
    .map(([key, v]) => ({
      key,
      name: v.name,
      fit: Math.round((v.sg / Math.max(v.w, 0.01)) * 100) / 100,
      apps: v.apps,
      detail: v.detail,
    }))
    .sort((a, b) => b.fit - a.fit)
}

export { normName }

// Course renovations that ESPN has not picked up.
//
// ESPN's course card is not reliably updated after a redesign — verified for
// the 2026 Rocket Classic, where ESPN still served the pre-renovation card
// (par 72 / 7,370 yds) identical to 2024 and 2025, months after a $16.1m
// rebuild changed the par. A wrong card silently corrupts the radar, the
// course-similarity matching and the scoring model, so known changes are
// recorded here and override whatever ESPN returns.
//
// `historyValidFrom` marks the season from which past results at this venue
// are still meaningful. Editions before it are excluded from the event-history
// skill nudge and the course-fit list: when two par 5s become 500-yard par 4s,
// who played well here in 2023 tells you very little.
//
// Match is by course name (normalized), scoped to a season range.

export const COURSE_OVERRIDES = [
  {
    match: 'detroit golf club',
    fromYear: 2026,
    source: 'Tyler Rae restoration, $16.1m, completed after the 2025 event',
    verifiedOn: '2026-07-27',
    historyValidFrom: 2026, // par change + two converted par 5s: prior editions void
    note:
      'Par 72→70, 7,328 yds. The 7th (505y) and 17th (537y) converted from par 5s — they ' +
      'were the two easiest holes in 2025. Greenside rough replaced with shaved run-offs; ' +
      '91 bunkers, deepened; no water hazard remains. Expect scoring several shots higher ' +
      'than the ~22-under historical norm.',
    course: {
      name: 'Detroit Golf Club',
      par: 70,
      yards: 7328,
      holes: [
        { number: 1, par: 4, yards: 402 },
        { number: 2, par: 4, yards: 494 },
        { number: 3, par: 4, yards: 373 },
        { number: 4, par: 5, yards: 592 },
        { number: 5, par: 3, yards: 156 },
        { number: 6, par: 4, yards: 501 },
        { number: 7, par: 4, yards: 505 },
        { number: 8, par: 4, yards: 349 },
        { number: 9, par: 3, yards: 205 },
        { number: 10, par: 4, yards: 422 },
        { number: 11, par: 3, yards: 246 },
        { number: 12, par: 4, yards: 481 },
        { number: 13, par: 4, yards: 413 },
        { number: 14, par: 5, yards: 561 },
        { number: 15, par: 3, yards: 163 },
        { number: 16, par: 4, yards: 456 },
        { number: 17, par: 4, yards: 537 },
        { number: 18, par: 4, yards: 472 },
      ],
    },
  },
]

function norm(name) {
  return (name ?? '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function findCourseOverride(courseName, seasonYear) {
  if (!courseName) return null
  const n = norm(courseName)
  return (
    COURSE_OVERRIDES.find(
      (o) => n.includes(o.match) && (!o.fromYear || (seasonYear ?? 9999) >= o.fromYear),
    ) ?? null
  )
}

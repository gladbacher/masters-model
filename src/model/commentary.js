// Turns the six-axis course profile into a written read of what the course
// demands. This is the same reasoning used to write those shortlists by hand:
// thresholds are set from tour norms (a 450-yard par 4 is the modern dividing
// line for "long"; a par 5 beyond ~565 stops being reachable for most; a
// par-3 set averaging 200+ is a long-iron test).

import { profileFromCourse } from './courseProfile'

const fmt = (n) => Math.round(n).toLocaleString()

export function courseCommentary(course, wind = null) {
  const profile = course ? profileFromCourse(course) : null
  if (!profile || !course?.holes?.length) return null

  const holes = course.holes
  const fours = holes.filter((h) => h.par === 4)
  const fives = holes.filter((h) => h.par === 5)
  const threes = holes.filter((h) => h.par === 3)
  const longFours = fours.filter((h) => h.yards >= 450)
  const shortFours = fours.filter((h) => h.yards <= 390)
  const reachableFives = fives.filter((h) => h.yards <= 565)
  const drivable = fours.filter((h) => h.yards <= 360)
  const scoringHoles = reachableFives.length + drivable.length

  const points = []
  let archetype
  let demands = []

  // --- length -----------------------------------------------------------
  const effLen = profile.length
  if (effLen >= 7600) {
    points.push({
      tag: 'Very long',
      text: `At ${fmt(course.yards)} yards (par-72 equivalent ${fmt(effLen)}), this is at the extreme end of the tour's length range. Distance is a prerequisite, not an advantage.`,
    })
  } else if (effLen >= 7350) {
    points.push({
      tag: 'Long',
      text: `${fmt(course.yards)} yards (par-72 equivalent ${fmt(effLen)}) — long enough that short hitters are playing a different course into the greens.`,
    })
  } else if (effLen <= 7050) {
    points.push({
      tag: 'Short',
      text: `At ${fmt(course.yards)} yards (par-72 equivalent ${fmt(effLen)}) this is short by modern standards. Driver is optional on many holes and raw distance counts for little.`,
    })
  } else {
    points.push({
      tag: 'Mid-length',
      text: `${fmt(course.yards)} yards (par-72 equivalent ${fmt(effLen)}) — a neutral test where length neither wins nor loses the week.`,
    })
  }

  // --- par 4 mix --------------------------------------------------------
  const longShare = fours.length ? longFours.length / fours.length : 0
  if (longShare >= 0.45) {
    points.push({
      tag: 'Long par 4s',
      text: `${longFours.length} of ${fours.length} par 4s measure 450+ yards${longFours.length ? ` (up to ${fmt(Math.max(...longFours.map((h) => h.yards)))})` : ''}. Expect a steady diet of long-iron approaches and a high bogey rate for anyone out of position.`,
    })
    demands.push('long-iron approach play')
  } else if (shortFours.length >= 4) {
    points.push({
      tag: 'Positional',
      text: `${shortFours.length} par 4s play 390 yards or less. Scoring comes from wedges, so approach precision and short-game conversion matter far more than tee-ball length.`,
    })
    demands.push('wedge play and approach precision')
  } else {
    points.push({
      tag: 'Par 4s',
      text: `The par 4s cluster in the mid-length band (${fmt(Math.min(...fours.map((h) => h.yards)))}–${fmt(Math.max(...fours.map((h) => h.yards)))} yards) — mid-iron golf, where iron quality separates the field.`,
    })
    demands.push('mid-iron accuracy')
  }

  // --- scoring opportunities -------------------------------------------
  if (scoringHoles === 0) {
    points.push({
      tag: 'No easy holes',
      text: `There is nowhere cheap to score: no drivable par 4, and ${fives.length ? `all ${fives.length} par 5s play beyond reach (${fives.map((h) => fmt(h.yards)).join(', ')} yards)` : 'no par 5s at all'}. Every birdie has to be earned with an approach.`,
    })
    demands.push('patience — bogey avoidance over birdie hunting')
  } else if (scoringHoles >= 4) {
    points.push({
      tag: 'Scorable',
      text: `${reachableFives.length} reachable par 5${reachableFives.length === 1 ? '' : 's'}${drivable.length ? ` and ${drivable.length} drivable par 4${drivable.length === 1 ? '' : 's'}` : ''} give real birdie inventory. Winners here go low, so aggression pays.`,
    })
    demands.push('birdie conversion on the scoring holes')
  } else {
    points.push({
      tag: 'Limited scoring',
      text: `Only ${scoringHoles} genuine scoring hole${scoringHoles === 1 ? '' : 's'} (${reachableFives.length} reachable par 5${reachableFives.length === 1 ? '' : 's'}${drivable.length ? `, ${drivable.length} drivable par 4` : ''}). Birdies must be manufactured on the par 4s rather than collected on the easy holes.`,
    })
    demands.push('birdies from mid-length par 4s')
  }

  // --- par 3s -----------------------------------------------------------
  if (profile.parThrees >= 205) {
    const longest = Math.max(...threes.map((h) => h.yards))
    points.push({
      tag: 'Brutal par 3s',
      text: `The par 3s average ${fmt(profile.parThrees)} yards, the longest at ${fmt(longest)}. This is a long-iron and hybrid test in its own right — par is a good score on most of them.`,
    })
    demands.push('long-iron control')
  } else if (profile.parThrees <= 170) {
    points.push({
      tag: 'Short par 3s',
      text: `Par 3s average only ${fmt(profile.parThrees)} yards — short-iron targets that good iron players should attack.`,
    })
  }

  // --- wind -------------------------------------------------------------
  if (wind != null && wind >= 15) {
    points.push({
      tag: 'Exposed',
      text: `Typically windy for the time of year (median daily peak around ${Math.round(wind)}mph). Flight control and a repeatable low ball matter, and scoring spreads widen sharply.`,
    })
    demands.push('wind play')
  }

  // --- archetype --------------------------------------------------------
  if (effLen >= 7550 && longShare >= 0.45) {
    archetype = 'A power course. Long, strong ball-strikers with elite long-iron control; short hitters are structurally disadvantaged.'
  } else if (effLen <= 7100 && scoringHoles >= 3) {
    archetype = 'A shot-makers\' course. Accurate iron players with sharp wedges and a hot putter — distance is close to irrelevant.'
  } else if (scoringHoles <= 1) {
    archetype = 'A grinder\'s course. Bogey avoidance and long-iron quality beat birdie streaks; expect a higher winning score than the field is used to.'
  } else {
    archetype = 'A balanced test. No single skill dominates, which tends to favour the best all-round players and reward current form over course specialism.'
  }

  return { points, archetype, demands }
}

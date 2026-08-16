/**
 * Choosing the Landing — which Room a student works in next (BHCS-30).
 *
 * The stub this replaces returned the lowest-mastery Room the student had
 * already attempted, and had one pathology worth naming: a Room they have never
 * touched has no `student_kc_state` row, so it was invisible. The planner could
 * only ever re-serve something they had already failed at. It could not
 * introduce a skill.
 *
 * ── Why the zone of proximal development is not a window on mastery ──
 *
 * `impl/skill-graph.md` specifies the band literally: pick Rooms where
 * `0.3 <= mastery_prob <= 0.7`. Against the seeded Blueprint that rule cannot
 * work, and it fails in a way that only became visible once 004 gave Rooms
 * different priors.
 *
 * Thirteen of the thirty Rooms are seeded below 0.3 — every difficulty-4 Room
 * among them — because a harder skill deserves a lower prior. A Room below the
 * band cannot be selected. Its mastery can only rise by being attempted. It can
 * only be attempted by being selected. Those thirteen Rooms were unreachable
 * for the life of the pilot, and nothing would have reported an error; the
 * planner would simply have never mentioned fractions.
 *
 * The band was also unreachable from the other side. Measured against the
 * seeded parameters, one correct answer on a Room at a 0.35 prior lands on
 * 0.839 — straight past 0.7 and over the 0.8 gate in a single question.
 *
 * So the absolute window is replaced by the relation it was always a proxy for:
 * **not yet mastered, and something underneath it already is.** Proximity to
 * mastery survives as a ranking signal, where being wrong is cheap, rather than
 * as a gate, where being wrong makes a Room invisible.
 *
 * ── Why mastery needs evidence and not just a number ──
 *
 * At the specified 0.8 gate, that same single correct answer marks a Room
 * mastered and unlocks everything behind it. One right answer is not mastery,
 * and a planner that believes it will march a child through the Blueprint at a
 * rate that flatters everyone and teaches no one.
 *
 * Mastery therefore needs both a high estimate and enough observations to mean
 * it. The gate is raised to 0.9 and paired with a floor on `evidence`, the
 * confidence-weighted attempt count added in BHCS-29. Neither alone is enough:
 * a number without observations is a prior wearing a costume, and observations
 * without a number are just practice.
 *
 * Pure. No I/O, no database — the route assembles a Floor plan and this decides
 * what to do with it, which is what makes the judgement testable.
 */

/** A Room, plus everything about this student's relationship to it. */
export interface FloorPlanRoom {
  kcId: string
  labelEn: string
  labelZh: string
  subject: string
  difficulty: number
  /** Posterior where there is history, the Room's own prior where there is not. */
  masteryProb: number
  attempts: number
  /** Confidence-weighted attempt count (BHCS-29). */
  evidence: number
  /** Ids of Rooms that must come first. Empty for an entry Room. */
  prerequisiteIds: string[]
  /** Unbroken run of wrong answers ending at the most recent attempt. */
  consecutiveFailures: number
}

export interface PlanFactor {
  name: string
  detail: string
  /** Contribution to the score, 0–1 before weighting. */
  value: number
  weight: number
}

export interface PlanCandidate {
  kcId: string
  labelEn: string
  labelZh: string
  subject: string
  difficulty: number
  masteryProb: number
  score: number
  factors: PlanFactor[]
}

export type PlanOutcome = 'planned' | 'bootstrap' | 'stuck' | 'complete'

export interface Plan {
  outcome: PlanOutcome
  targetKcId: string | null
  /** Ranked, best first. The runners-up are part of the answer, not debug output. */
  candidates: PlanCandidate[]
  /** Rooms withheld because the student keeps failing them. */
  needsTeacher: string[]
  reasonEn: string
  reasonZh: string
}

/**
 * A Room counts as mastered at 0.9 rather than the specified 0.8, and not below
 * three observations however high the number climbs. See the header.
 */
export const MASTERY_GATE = 0.9
export const MIN_EVIDENCE_FOR_MASTERY = 3

/**
 * After this many wrong answers in a row, stop assigning the Room and tell a
 * teacher. The ticket's rule: a student who has failed four times running needs
 * a different Room and a human, not a fifth identical Card.
 */
export const FAILURE_LIMIT = 4

/** Ranking weights. They sum to 1 so a score reads as a fraction. */
const W_READINESS = 0.45
const W_PROXIMITY = 0.35
const W_RECENCY = 0.2

export function isMastered(room: FloorPlanRoom): boolean {
  return room.masteryProb >= MASTERY_GATE && room.evidence >= MIN_EVIDENCE_FOR_MASTERY
}

/**
 * Decide the Landing.
 *
 * `rooms` must be the assessable leaves only — headings are never assigned, and
 * 004 guarantees prerequisite edges never touch one.
 */
export function planNext(rooms: FloorPlanRoom[]): Plan {
  const mastered = new Set(rooms.filter(isMastered).map((r) => r.kcId))
  const untouched = rooms.every((r) => r.attempts === 0)

  const unmastered = rooms.filter((r) => !mastered.has(r.kcId))
  if (!unmastered.length) {
    return {
      outcome: 'complete',
      targetKcId: null,
      candidates: [],
      needsTeacher: [],
      reasonEn: 'Every Room in the Blueprint is mastered. There is nothing left to assign at this level.',
      reasonZh: '蓝图上的每个房间都已掌握，这个层级已经没有可以布置的内容了。',
    }
  }

  // Unlocked: an entry Room, or a Room with at least one mastered prerequisite.
  // Requiring *all* of them would be stricter than the Blueprint intends and
  // would also make the scaffolding tiebreak below vacuous, since every
  // survivor would score identically.
  const unlocked = unmastered.filter(
    (r) => r.prerequisiteIds.length === 0 || r.prerequisiteIds.some((id) => mastered.has(id)),
  )

  const needsTeacher = unlocked
    .filter((r) => r.consecutiveFailures >= FAILURE_LIMIT)
    .map((r) => r.kcId)
  const eligible = unlocked.filter((r) => r.consecutiveFailures < FAILURE_LIMIT)

  if (!eligible.length) {
    const stuck = needsTeacher.length > 0
    return {
      outcome: 'stuck',
      targetKcId: null,
      candidates: [],
      needsTeacher,
      reasonEn: stuck
        ? 'Every Room this student can reach has been failed four times running. A teacher should look before another Card is printed.'
        : 'Nothing is unlocked. No Room has a mastered prerequisite, which means the Floor plan needs a bootstrap eval before planning can start.',
      reasonZh: stuck
        ? '这位学生目前能接触到的每个房间都已连续答错四次。在再打印一张练习卡之前，需要老师看一下。'
        : '目前没有解锁的房间：没有任何前置技能已掌握，需要先做一次入门测评。',
    }
  }

  const candidates = eligible
    .map((room) => score(room, mastered))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.difficulty - b.difficulty ||
        (a.kcId < b.kcId ? -1 : a.kcId > b.kcId ? 1 : 0),
    )

  const top = candidates[0]!
  return {
    outcome: untouched ? 'bootstrap' : 'planned',
    targetKcId: top.kcId,
    candidates,
    needsTeacher,
    reasonEn: untouched
      ? `No work has been recorded yet, so this is a starting point rather than a plan: ${top.labelEn} is one of the Rooms with nothing before it.`
      : explain(top, 'en'),
    reasonZh: untouched
      ? `目前还没有任何练习记录，所以这只是一个起点：「${top.labelZh}」是没有前置要求的房间之一。`
      : explain(top, 'zh'),
  }
}

function score(room: FloorPlanRoom, mastered: Set<string>): PlanCandidate {
  const total = room.prerequisiteIds.length
  const done = room.prerequisiteIds.filter((id) => mastered.has(id))
  // An entry Room is fully scaffolded by definition — there is nothing it is
  // waiting on. Scoring it 0 would bury exactly the Rooms a new student needs.
  const readiness = total === 0 ? 1 : done.length / total

  // What the band was reaching for, as a preference rather than a gate — but
  // which of two questions that is depends on whether the number means
  // anything yet.
  //
  // With evidence behind it, the useful question is *how close to finished*:
  // a Room at 0.85 after four attempts is one Card from done, and finishing it
  // is worth more than starting something else.
  //
  // With no evidence — every Room after a teacher's placement (BHCS-32) — that
  // same question inverts into "assign whatever an adult said they already
  // know", which is how a third-grader placed at grade 3 gets handed CVC word
  // decoding as their first Card. Reading level research in this repo is blunt
  // about the cost of that: babyish is its own kind of shaming.
  //
  // With only a prior, the useful question is *how uncertain*. A prior near 0.5
  // is the teacher saying "this is exactly their edge", which is both the most
  // informative Room to test and the right place to start work. Peaks at 0.5,
  // falls to zero at either extreme.
  const closeness = Math.min(1, Math.max(0, room.masteryProb) / MASTERY_GATE)
  const uncertainty = 1 - 2 * Math.abs(Math.max(0, Math.min(1, room.masteryProb)) - 0.5)

  // How much the number has earned the right to be read as progress. Zero at no
  // evidence, 0.6 at three attempts, 0.83 at ten.
  const trust = room.evidence / (room.evidence + 2)
  const proximity = trust * closeness + (1 - trust) * uncertainty

  // product/prd.md §3 — recent failures weigh higher. A Room just got wrong is
  // the most useful thing to hand back, right up until the point where handing
  // it back again stops helping, which FAILURE_LIMIT decides.
  const recency = room.consecutiveFailures > 0 ? 1 : 0

  const factors: PlanFactor[] = [
    {
      name: 'prerequisites mastered',
      detail:
        total === 0
          ? 'nothing has to come first'
          : `${done.length} of ${total}${done.length ? ` — ${done.join(', ')}` : ''}`,
      value: readiness,
      weight: W_READINESS,
    },
    {
      name: trust >= 0.5 ? 'closeness to mastery' : 'how much is still unknown',
      detail:
        trust >= 0.5
          ? `${room.masteryProb.toFixed(2)} against a ${MASTERY_GATE} gate, from ${room.attempts} attempt${room.attempts === 1 ? '' : 's'}`
          : `${room.masteryProb.toFixed(2)} is still a prior — ${room.attempts === 0 ? 'nobody has asked yet' : `only ${room.attempts} attempt${room.attempts === 1 ? '' : 's'} so far`}`,
      value: proximity,
      weight: W_PROXIMITY,
    },
    {
      name: 'recently got wrong',
      detail:
        room.consecutiveFailures > 0
          ? `${room.consecutiveFailures} wrong in a row — worth another go before ${FAILURE_LIMIT}`
          : 'not currently being got wrong',
      value: recency,
      weight: W_RECENCY,
    },
  ]

  return {
    kcId: room.kcId,
    labelEn: room.labelEn,
    labelZh: room.labelZh,
    subject: room.subject,
    difficulty: room.difficulty,
    masteryProb: room.masteryProb,
    score: factors.reduce((sum, f) => sum + f.value * f.weight, 0),
    factors,
  }
}

/**
 * Why this Room, in a sentence.
 *
 * "Selection is transparent — student and teacher can always see which KC was
 * chosen and why" is a stated constraint in `product/user-stories.md`, and a
 * bare `targetKcId` fails it. The prose leads with whichever factor actually
 * decided, so the sentence changes when the reasoning does rather than being a
 * template with a name slotted in.
 */
function explain(c: PlanCandidate, lang: 'en' | 'zh'): string {
  const [readiness, proximity, recency] = c.factors as [PlanFactor, PlanFactor, PlanFactor]
  const label = lang === 'en' ? c.labelEn : c.labelZh

  if (recency.value > 0) {
    return lang === 'en'
      ? `${label} came up wrong recently and is worth another go while it is fresh.`
      : `「${label}」最近做错了，趁着印象还新，值得再练一次。`
  }
  if (proximity.value > 0.6) {
    if (proximity.name === 'closeness to mastery') {
      return lang === 'en'
        ? `${label} is close to finished — ${c.masteryProb.toFixed(2)} against a ${MASTERY_GATE} gate. One more Card should settle it.`
        : `「${label}」快要掌握了——目前 ${c.masteryProb.toFixed(2)}，门槛是 ${MASTERY_GATE}。再做一张卡应该就稳了。`
    }
    return lang === 'en'
      ? `${label} sits right at the edge of what this student can do, and nothing has tested it yet — the most useful place to start.`
      : `「${label}」正处在这位学生能力的边缘，而且还没有测试过，是最值得先做的地方。`
  }
  if (readiness.value === 1 && readiness.detail !== 'nothing has to come first') {
    // Labels are noun phrases and some carry their own article ("The four
    // tones"), so the label leads the sentence rather than sitting inside it.
    return lang === 'en'
      ? `${label} — everything it depends on is already mastered, so it is the natural next step.`
      : `「${label}」所依赖的技能都已掌握，所以这是自然的下一步。`
  }
  return lang === 'en'
    ? `${label} is unlocked and not yet mastered, and is the best-scaffolded Room available right now.`
    : `「${label}」已解锁但尚未掌握，是目前铺垫最充分的房间。`
}

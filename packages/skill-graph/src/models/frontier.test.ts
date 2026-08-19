import { describe, expect, it } from 'vitest'
import {
  ASSUMED_PASSED,
  FAILURE_LIMIT,
  isAssumedPassed,
  isMastered,
  MASTERY_GATE,
  MIN_EVIDENCE_FOR_MASTERY,
  planNext,
  type FloorPlanRoom,
} from './frontier.js'

const room = (kcId: string, over: Partial<FloorPlanRoom> = {}): FloorPlanRoom => ({
  kcId,
  labelEn: kcId,
  labelZh: kcId,
  subject: 'math',
  difficulty: 3,
  masteryProb: 0.3,
  attempts: 0,
  evidence: 0,
  prerequisiteIds: [],
  consecutiveFailures: 0,
  ...over,
})

/** Mastered convincingly: high enough, and asked often enough to mean it. */
const done = (kcId: string, over: Partial<FloorPlanRoom> = {}) =>
  room(kcId, { masteryProb: 0.95, attempts: 5, evidence: 5, ...over })

describe('isMastered', () => {
  it('will not call one lucky answer mastery', () => {
    // The exact case BHCS-29 measured: 0.35 -> 0.839 on a single correct
    // answer. Under the specified 0.8 gate that unlocked the whole branch.
    expect(isMastered(room('a', { masteryProb: 0.839, attempts: 1, evidence: 1 }))).toBe(false)
  })

  it('will not call long practice mastery if the number stays low', () => {
    expect(isMastered(room('a', { masteryProb: 0.6, attempts: 20, evidence: 20 }))).toBe(false)
  })

  it('needs both the number and the evidence', () => {
    expect(
      isMastered(room('a', { masteryProb: MASTERY_GATE, evidence: MIN_EVIDENCE_FOR_MASTERY })),
    ).toBe(true)
    expect(
      isMastered(room('a', { masteryProb: MASTERY_GATE, evidence: MIN_EVIDENCE_FOR_MASTERY - 1 })),
    ).toBe(false)
  })
})

describe('planNext', () => {
  it('starts a brand-new student on a Room with nothing before it', () => {
    const plan = planNext([
      room('entry', { masteryProb: 0.35 }),
      room('later', { masteryProb: 0.3, prerequisiteIds: ['entry'] }),
    ])
    expect(plan.outcome).toBe('bootstrap')
    expect(plan.targetKcId).toBe('entry')
    expect(plan.reasonEn).toContain('starting point')
    expect(plan.reasonZh.length).toBeGreaterThan(0)
  })

  // The defect this planner exists to fix. Thirteen of the thirty seeded Rooms
  // sit below the specified 0.3 band floor, so the literal rule could never
  // select them — and their mastery could only rise by being selected.
  it('can select a Room seeded below the old ZPD band floor', () => {
    const plan = planNext([
      done('math/base-ten/add-3-digit'),
      room('math/fractions/equivalent', {
        masteryProb: 0.25,
        difficulty: 4,
        prerequisiteIds: ['math/base-ten/add-3-digit'],
      }),
    ])
    expect(plan.targetKcId).toBe('math/fractions/equivalent')
  })

  it('never returns a Room the student has already mastered', () => {
    const plan = planNext([done('a'), room('b', { prerequisiteIds: ['a'] })])
    expect(plan.targetKcId).toBe('b')
    expect(plan.candidates.map((c) => c.kcId)).not.toContain('a')
  })

  it('will not introduce a Room whose prerequisites are all still unmastered', () => {
    const plan = planNext([
      room('basics', { masteryProb: 0.3 }),
      room('advanced', { masteryProb: 0.5, prerequisiteIds: ['basics'] }),
    ])
    expect(plan.targetKcId).toBe('basics')
    expect(plan.candidates.map((c) => c.kcId)).not.toContain('advanced')
  })

  it('crosses an unlocked edge once the branch below is finished', () => {
    const plan = planNext([
      done('mult'),
      done('divide', { prerequisiteIds: ['mult'] }),
      room('unit-fraction', { masteryProb: 0.3, prerequisiteIds: ['divide'] }),
    ])
    expect(plan.outcome).toBe('planned')
    expect(plan.targetKcId).toBe('unit-fraction')
  })

  it('hands back what was just got wrong, and says that is why', () => {
    const plan = planNext([
      room('fresh', { masteryProb: 0.4, attempts: 1, evidence: 1 }),
      room('missed', { masteryProb: 0.2, attempts: 2, evidence: 2, consecutiveFailures: 2 }),
    ])
    expect(plan.targetKcId).toBe('missed')
    expect(plan.reasonEn).toContain('wrong recently')
  })

  it('stops handing back a Room that has been failed four times, and flags it', () => {
    const plan = planNext([
      room('wall', { masteryProb: 0.15, attempts: 6, evidence: 6, consecutiveFailures: FAILURE_LIMIT }),
      room('elsewhere', { masteryProb: 0.3, attempts: 1, evidence: 1 }),
    ])
    expect(plan.targetKcId).toBe('elsewhere')
    expect(plan.needsTeacher).toEqual(['wall'])
    expect(plan.candidates.map((c) => c.kcId)).not.toContain('wall')
  })

  it('refuses to print anything when every reachable Room is a wall', () => {
    const plan = planNext([
      room('wall', { masteryProb: 0.1, attempts: 9, evidence: 9, consecutiveFailures: 5 }),
    ])
    expect(plan.outcome).toBe('stuck')
    expect(plan.targetKcId).toBeNull()
    expect(plan.needsTeacher).toEqual(['wall'])
    expect(plan.reasonEn).toContain('teacher')
  })

  it('has an answer for a finished Blueprint rather than an empty response', () => {
    const plan = planNext([done('a'), done('b', { prerequisiteIds: ['a'] })])
    expect(plan.outcome).toBe('complete')
    expect(plan.targetKcId).toBeNull()
    expect(plan.candidates).toEqual([])
    expect(plan.reasonZh.length).toBeGreaterThan(0)
  })

  // BHCS-32 made this reachable: after a teacher's placement every Room carries
  // a prior and no evidence, and ranking those by closeness-to-mastery hands a
  // third-grader the Room an adult said they already knew.
  it('starts an unmeasured student where the estimate is least certain', () => {
    const plan = planNext([
      room('already-knows', { masteryProb: 0.85, attempts: 0, evidence: 0 }),
      room('at-their-edge', { masteryProb: 0.45, attempts: 0, evidence: 0 }),
      room('way-beyond', { masteryProb: 0.15, attempts: 0, evidence: 0 }),
    ])
    expect(plan.targetKcId).toBe('at-their-edge')
    expect(plan.candidates[0]!.factors[1]!.name).toBe('how much is still unknown')
  })

  it('flips to closeness-to-mastery once the number has been earned', () => {
    // Same two Rooms as above, but now the high one has been demonstrated.
    const plan = planNext([
      room('demonstrated', { masteryProb: 0.85, attempts: 6, evidence: 6 }),
      room('at-their-edge', { masteryProb: 0.45, attempts: 6, evidence: 6 }),
    ])
    expect(plan.targetKcId).toBe('demonstrated')
    expect(plan.candidates[0]!.factors[1]!.name).toBe('closeness to mastery')
    expect(plan.reasonEn).toContain('close to finished')
  })

  it('says plainly when it is starting somewhere untested', () => {
    // Not a bootstrap — the student has worked elsewhere — but the Room being
    // chosen is still carrying nothing but a teacher's estimate.
    const plan = planNext([
      done('worked-here'),
      room('edge', { masteryProb: 0.5, attempts: 0, evidence: 0 }),
    ])
    expect(plan.outcome).toBe('planned')
    expect(plan.targetKcId).toBe('edge')
    expect(plan.reasonEn).toContain('nothing has tested it yet')
    expect(plan.candidates[0]!.factors[1]!.detail).toContain('still a prior')
  })

describe('a placement opening doors without becoming mastery', () => {
  // The bug this fixes: a child placed at Chinese grade 4 still started at the
  // grade-1 entry Room, because a placement seeds priors and unlocking needed
  // mastery. Placement moved every number and opened nothing.
  it('unlocks past a Room the teacher placed the child above', () => {
    const plan = planNext([
      room('foundation', { masteryProb: 0.85, attempts: 0, evidence: 0, difficulty: 1 }),
      room('their-level', { masteryProb: 0.45, attempts: 0, evidence: 0, difficulty: 3, prerequisiteIds: ['foundation'] }),
    ])
    expect(plan.candidates.map((c) => c.kcId)).toContain('their-level')
  })

  it('still refuses to call it mastered', () => {
    const placed = room('foundation', { masteryProb: 0.85, attempts: 0, evidence: 0 })
    expect(isAssumedPassed(placed)).toBe(true)
    expect(isMastered(placed)).toBe(false)
  })

  // The defect this rule exists for: an entry Room scores readiness 1 because
  // nothing precedes it, which beat every level-appropriate Room reached
  // through the placement — so a child placed at grade 3 got the grade-2
  // foundation every time.
  it('does not assign a Room the teacher placed the child above', () => {
    const plan = planNext([
      room('foundation', { masteryProb: 0.85, attempts: 0, difficulty: 2 }),
      room('their-level', { masteryProb: 0.45, attempts: 0, difficulty: 3, prerequisiteIds: ['foundation'] }),
    ])
    expect(plan.targetKcId).toBe('their-level')
    expect(plan.candidates.map((c) => c.kcId)).not.toContain('foundation')
  })

  // Better a Card that is too easy than no Card.
  it('assigns one anyway when everything reachable is assumed known', () => {
    const plan = planNext([room('foundation', { masteryProb: 0.85, attempts: 0 })])
    expect(plan.outcome).toBe('bootstrap')
    expect(plan.targetKcId).toBe('foundation')
    expect(plan.reasonEn).toContain('too easy')
    expect(plan.reasonZh).toContain('偏简单')
  })

  // The guard that keeps this from unlocking on real, partial work.
  it('does not unlock past a Room the child is halfway through', () => {
    const plan = planNext([
      room('halfway', { masteryProb: 0.75, attempts: 4, evidence: 4 }),
      room('after', { masteryProb: 0.3, prerequisiteIds: ['halfway'] }),
    ])
    expect(isAssumedPassed({ ...room('halfway'), masteryProb: 0.75, attempts: 4 })).toBe(false)
    expect(plan.candidates.map((c) => c.kcId)).not.toContain('after')
  })

  it('does not unlock past a Room placed at the child’s own level', () => {
    // 0.45 is "right at their level" — not a claim they are past it.
    expect(isAssumedPassed(room('at-level', { masteryProb: 0.45, attempts: 0 }))).toBe(false)
    expect(ASSUMED_PASSED).toBeGreaterThan(0.45)
  })

  it('ranks an assumed prerequisite below a demonstrated one', () => {
    const shown = planNext([
      done('shown'),
      room('after-shown', { masteryProb: 0.4, prerequisiteIds: ['shown'] }),
    ]).candidates[0]!
    const guessed = planNext([
      room('guessed', { masteryProb: 0.85, attempts: 0 }),
      room('after-guessed', { masteryProb: 0.4, prerequisiteIds: ['guessed'] }),
    ]).candidates.find((c) => c.kcId === 'after-guessed')!
    expect(shown.factors[0]!.value).toBeGreaterThan(guessed.factors[0]!.value)
  })

  it('says in the reason when a door was opened by placement, not by work', () => {
    const plan = planNext([
      room('foundation', { masteryProb: 0.85, attempts: 0 }),
      room('their-level', { masteryProb: 0.45, prerequisiteIds: ['foundation'] }),
    ])
    const c = plan.candidates.find((x) => x.kcId === 'their-level')!
    expect(c.factors[0]!.detail).toContain('assumed from placement')
  })
})

  it('prefers the Room that is nearly finished over one barely begun', () => {
    const plan = planNext([
      room('nearly', { masteryProb: 0.85, attempts: 2, evidence: 2 }),
      room('barely', { masteryProb: 0.2, attempts: 1, evidence: 1 }),
    ])
    expect(plan.targetKcId).toBe('nearly')
    expect(plan.reasonEn).toContain('close to finished')
  })

  it('ranks the runners-up too, so a teacher can see what else was considered', () => {
    const plan = planNext([
      room('a', { masteryProb: 0.8, attempts: 2, evidence: 2 }),
      room('b', { masteryProb: 0.5, attempts: 1, evidence: 1 }),
      room('c', { masteryProb: 0.2, attempts: 1, evidence: 1 }),
    ])
    expect(plan.candidates).toHaveLength(3)
    const scores = plan.candidates.map((c) => c.score)
    expect(scores).toEqual([...scores].sort((x, y) => y - x))
    expect(plan.candidates[0]!.factors).toHaveLength(3)
  })

  it('is deterministic when two Rooms score identically', () => {
    const rooms = [room('z-easy', { difficulty: 2 }), room('a-hard', { difficulty: 5 })]
    const first = planNext(rooms).targetKcId
    const again = planNext([...rooms].reverse()).targetKcId
    expect(first).toBe(again)
    expect(first).toBe('z-easy') // lower difficulty breaks the tie
  })

  it('explains itself in both languages, whichever factor decided', () => {
    for (const plan of [
      planNext([room('x', { masteryProb: 0.85, attempts: 2, evidence: 2 })]),
      planNext([room('x', { masteryProb: 0.2, attempts: 2, evidence: 2, consecutiveFailures: 1 })]),
      planNext([done('a'), room('x', { masteryProb: 0.3, attempts: 1, evidence: 1, prerequisiteIds: ['a'] })]),
    ]) {
      expect(plan.reasonEn.length).toBeGreaterThan(10)
      expect(plan.reasonZh.length).toBeGreaterThan(5)
      expect(plan.reasonEn).not.toBe(plan.reasonZh)
    }
  })
})

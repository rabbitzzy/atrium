import { describe, expect, it } from 'vitest'
import { derivePlacement, type PlacementRoom } from './placement.js'
import { isMastered, MASTERY_GATE } from './frontier.js'

const room = (kcId: string, difficulty: number, over: Partial<PlacementRoom> = {}): PlacementRoom => ({
  kcId,
  labelEn: kcId,
  subject: kcId.startsWith('math') ? 'math' : 'language',
  difficulty,
  bktPL0: 0.3,
  attempts: 0,
  ...over,
})

const BLUEPRINT: PlacementRoom[] = [
  room('math/base-ten/place-value-hundreds', 2),
  room('math/ops/multiplication-facts', 3),
  room('math/fractions/equivalent', 4),
  room('lang/en/phonics/cvc-words', 1),
  room('lang/en/reading/inference', 4),
  room('lang/zh/pinyin/tones', 1),
  room('lang/zh/chars/grade2-set1', 3),
]

const priorOf = (r: ReturnType<typeof derivePlacement>, kcId: string) =>
  r.seeded.find((s) => s.kcId === kcId)?.masteryProb

describe('derivePlacement', () => {
  it('places a third-grader high on grade-1 work and low on grade-4', () => {
    const out = derivePlacement({ levels: { math: 3, 'lang/en': 3, 'lang/zh': 1 } }, BLUEPRINT)

    expect(priorOf(out, 'math/base-ten/place-value-hundreds')).toBe(0.7) // one grade below
    expect(priorOf(out, 'math/ops/multiplication-facts')).toBe(0.45) // at level
    expect(priorOf(out, 'math/fractions/equivalent')).toBe(0.25) // one grade above
    expect(priorOf(out, 'lang/en/phonics/cvc-words')).toBe(0.85) // well below
    expect(priorOf(out, 'lang/en/reading/inference')).toBe(0.25)
  })

  // The heritage-learner case the whole product is shaped around: the same
  // child reads English at grade 3 and Chinese at grade 1.
  it('places the two languages independently', () => {
    const out = derivePlacement({ levels: { 'lang/en': 3, 'lang/zh': 1 } }, BLUEPRINT)
    expect(priorOf(out, 'lang/en/phonics/cvc-words')).toBe(0.85)
    expect(priorOf(out, 'lang/zh/pinyin/tones')).toBe(0.45)
    expect(priorOf(out, 'lang/zh/chars/grade2-set1')).toBe(0.15) // well above
  })

  it('matches the longest root, so lang/en never absorbs lang/zh', () => {
    const out = derivePlacement({ levels: { lang: 5, 'lang/zh': 1 } }, BLUEPRINT)
    expect(priorOf(out, 'lang/zh/chars/grade2-set1')).toBe(0.15) // placed by lang/zh, not lang
    expect(priorOf(out, 'lang/en/reading/inference')).toBe(0.7) // placed by lang
  })

  // The rule that keeps a teacher's guess from being read as measurement.
  it('never emits a prior that could pass for mastery', () => {
    const out = derivePlacement(
      { levels: { math: 5, 'lang/en': 5, 'lang/zh': 5 }, rooms: { 'lang/zh/pinyin/tones': 'mastered' } },
      BLUEPRINT,
    )
    for (const s of out.seeded) {
      expect(s.masteryProb).toBeLessThan(MASTERY_GATE)
      // Belt and braces: even fed straight into the planner with zero
      // evidence, nothing a placement writes can read as mastered.
      expect(
        isMastered({
          kcId: s.kcId,
          labelEn: s.kcId,
          labelZh: s.kcId,
          subject: 'math',
          difficulty: 1,
          masteryProb: s.masteryProb,
          attempts: 0,
          evidence: 0,
          prerequisiteIds: [],
          consecutiveFailures: 0,
        }),
      ).toBe(false)
    }
  })

  it('lets a teacher override one Room without touching the rest', () => {
    const out = derivePlacement(
      { levels: { math: 3 }, rooms: { 'math/fractions/equivalent': 'shaky' } },
      BLUEPRINT,
    )
    expect(priorOf(out, 'math/fractions/equivalent')).toBe(0.55)
    expect(priorOf(out, 'math/ops/multiplication-facts')).toBe(0.45)
    expect(out.seeded.find((s) => s.kcId === 'math/fractions/equivalent')!.basis).toContain('teacher marked')
  })

  // A redo mid-term must not erase real work.
  it('refuses to overwrite a Room the student has actually attempted', () => {
    const measured = BLUEPRINT.map((r) =>
      r.kcId === 'math/ops/multiplication-facts' ? { ...r, attempts: 6 } : r,
    )
    const out = derivePlacement({ levels: { math: 3 } }, measured)
    expect(out.skipped).toContain('math/ops/multiplication-facts')
    expect(priorOf(out, 'math/ops/multiplication-facts')).toBeUndefined()
  })

  it('will not let an override reach past a measured Room either', () => {
    const measured = BLUEPRINT.map((r) =>
      r.kcId === 'math/fractions/equivalent' ? { ...r, attempts: 3 } : r,
    )
    const out = derivePlacement(
      { levels: { math: 3 }, rooms: { 'math/fractions/equivalent': 'mastered' } },
      measured,
    )
    expect(out.skipped).toContain('math/fractions/equivalent')
    expect(priorOf(out, 'math/fractions/equivalent')).toBeUndefined()
  })

  it('leaves subjects the teacher said nothing about at the Blueprint prior', () => {
    const out = derivePlacement({ levels: { math: 3 } }, BLUEPRINT)
    expect(out.seeded.every((s) => s.kcId.startsWith('math'))).toBe(true)
    expect(out.seeded).toHaveLength(3)
  })

  it('reports a mistyped root instead of silently doing nothing', () => {
    const out = derivePlacement({ levels: { math: 3, 'language/zh': 2 } }, BLUEPRINT)
    expect(out.unknownRoots).toEqual(['language/zh'])
  })

  // The retired Room from 004 is the realistic version of this typo.
  it('reports a named Room that is not in the Blueprint', () => {
    const out = derivePlacement(
      { levels: { math: 3 }, rooms: { 'lang/zh/writing/copy-accuracy': 'shaky' } },
      BLUEPRINT,
    )
    expect(out.unknownRooms).toEqual(['lang/zh/writing/copy-accuracy'])
  })

  it('does not call a root unknown just because every Room under it was skipped', () => {
    const measured = BLUEPRINT.map((r) => (r.kcId.startsWith('lang/zh') ? { ...r, attempts: 4 } : r))
    const out = derivePlacement({ levels: { 'lang/zh': 2 } }, measured)
    expect(out.unknownRoots).toEqual([])
    expect(out.skipped).toContain('lang/zh/pinyin/tones')
  })

  it('states its reasoning for every Room it writes', () => {
    const out = derivePlacement({ levels: { math: 3 } }, BLUEPRINT)
    for (const s of out.seeded) {
      expect(s.basis).toMatch(/grade 3 for math|teacher marked/)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { buildRadar, type BlueprintKc, type KcStateRow } from './radar.js'

const kc = (id: string, prior: number): BlueprintKc => ({
  id,
  label_en: id,
  label_zh: id,
  subject: 'math',
  depth: 2,
  difficulty: 3,
  bkt_p_l0: prior,
})

const BLUEPRINT: BlueprintKc[] = [
  kc('math/base-ten/add-3-digit', 0.35),
  kc('math/fractions/compare', 0.25),
  kc('math/ops/multiplication-facts', 0.3),
]

describe('buildRadar', () => {
  // The case BHCS-28's acceptance is actually about.
  it('gives a student with no history one point per KC, each at its prior', () => {
    const radar = buildRadar(BLUEPRINT, [])

    expect(radar).toHaveLength(3)
    expect(radar.map((p) => p.masteryProb)).toEqual([0.35, 0.25, 0.3])
    expect(radar.every((p) => p.attempts === 0)).toBe(true)
    expect(radar.every((p) => p.seen === false)).toBe(true)
    expect(radar.every((p) => p.lastSeenAt === null)).toBe(true)
  })

  it('distinguishes an assumed prior from measured evidence at the same value', () => {
    const measured: KcStateRow[] = [
      { kc_id: 'math/fractions/compare', mastery_prob: 0.25, attempts: 4, last_seen_at: '2026-08-12T00:00:00Z' },
    ]
    const radar = buildRadar(BLUEPRINT, measured)

    const assumed = radar.find((p) => p.kcId === 'math/base-ten/add-3-digit')!
    const evidence = radar.find((p) => p.kcId === 'math/fractions/compare')!

    // Same kind of number, opposite meaning: one is four wrong answers, the
    // other is the model never having met the child.
    expect(evidence.masteryProb).toBe(0.25)
    expect(evidence.seen).toBe(true)
    expect(evidence.attempts).toBe(4)
    expect(assumed.seen).toBe(false)
  })

  it('prefers the posterior over the prior wherever history exists', () => {
    const radar = buildRadar(BLUEPRINT, [
      { kc_id: 'math/ops/multiplication-facts', mastery_prob: 0.92, attempts: 2, last_seen_at: '2026-08-12T00:00:00Z' },
    ])

    const point = radar.find((p) => p.kcId === 'math/ops/multiplication-facts')!
    expect(point.masteryProb).toBe(0.92)
    expect(point.lastSeenAt).toBe('2026-08-12T00:00:00Z')
  })

  // A posterior of 0 is a real value BKT can reach; `??` must not treat it as
  // missing and quietly substitute the prior, which would read as progress.
  it('does not mistake a zero posterior for absent history', () => {
    const radar = buildRadar([kc('math/fractions/compare', 0.25)], [
      { kc_id: 'math/fractions/compare', mastery_prob: 0, attempts: 6, last_seen_at: null },
    ])

    expect(radar[0]!.masteryProb).toBe(0)
    expect(radar[0]!.seen).toBe(true)
  })

  it('drops state for KCs a later migration retired', () => {
    const radar = buildRadar(BLUEPRINT, [
      { kc_id: 'lang/zh/hanzi/stroke-order', mastery_prob: 0.8, attempts: 3, last_seen_at: null },
    ])

    expect(radar).toHaveLength(3)
    expect(radar.some((p) => p.kcId === 'lang/zh/hanzi/stroke-order')).toBe(false)
  })

  it('preserves Blueprint order so the caller controls the axes', () => {
    const radar = buildRadar(BLUEPRINT, [])
    expect(radar.map((p) => p.kcId)).toEqual(BLUEPRINT.map((k) => k.id))
  })
})

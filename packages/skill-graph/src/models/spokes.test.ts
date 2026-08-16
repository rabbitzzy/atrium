import { describe, expect, it } from 'vitest'
import { buildSpokes, type SpokeInput, type StrandLabel } from './spokes.js'

const STRANDS: StrandLabel[] = [
  { id: 'math/base-ten', labelEn: 'Base Ten', labelZh: '十进制与数位', subject: 'math' },
  { id: 'math/fractions', labelEn: 'Fractions', labelZh: '分数', subject: 'math' },
  { id: 'lang/zh/pinyin', labelEn: 'Pinyin', labelZh: '拼音', subject: 'language' },
  { id: 'lang/zh/reading', labelEn: 'Chinese Reading', labelZh: '中文阅读', subject: 'language' },
]

const pt = (kcId: string, over: Partial<SpokeInput> = {}): SpokeInput => ({
  kcId,
  subject: kcId.startsWith('math') ? 'math' : 'language',
  masteryProb: 0.3,
  attempts: 0,
  evidence: 0,
  seen: false,
  ...over,
})

const spokeFor = (spokes: ReturnType<typeof buildSpokes>, id: string) =>
  spokes.find((s) => s.strandId === id)!

describe('buildSpokes', () => {
  it('averages the Rooms of a strand onto one axis', () => {
    const spokes = buildSpokes(
      [
        pt('math/fractions/unit-fraction', { masteryProb: 0.9 }),
        pt('math/fractions/equivalent', { masteryProb: 0.5 }),
        pt('math/fractions/compare', { masteryProb: 0.1 }),
      ],
      STRANDS,
    )
    expect(spokeFor(spokes, 'math/fractions').value).toBeCloseTo(0.5, 10)
    expect(spokeFor(spokes, 'math/fractions').rooms).toBe(3)
  })

  it('lands a Room on its deepest strand, never its subject', () => {
    const spokes = buildSpokes(
      [pt('lang/zh/reading/sentence-meaning', { masteryProb: 0.8 })],
      [...STRANDS, { id: 'lang/zh', labelEn: 'Chinese', labelZh: '中文', subject: 'language' }],
    )
    expect(spokeFor(spokes, 'lang/zh/reading').value).toBe(0.8)
    expect(spokes.some((s) => s.strandId === 'lang/zh')).toBe(false)
  })

  // The lie BHCS-33 names: after a placement every Room carries a number and
  // none of them has been tested.
  it('marks an axis unseen when the whole strand is still priors', () => {
    const spokes = buildSpokes(
      [
        pt('math/base-ten/add-3-digit', { masteryProb: 0.7, attempts: 0, evidence: 0 }),
        pt('math/base-ten/subtract-3-digit', { masteryProb: 0.7, attempts: 0, evidence: 0 }),
      ],
      STRANDS,
    )
    const spoke = spokeFor(spokes, 'math/base-ten')
    expect(spoke.value).toBeCloseTo(0.7, 10)
    expect(spoke.seen).toBe(false)
    expect(spoke.seenRooms).toBe(0)
    // Zero evidence gives the maximum half-width of 0.5, clipped at the top:
    // 0.2 to 1.0. An axis that spans four fifths of the chart is the picture
    // refusing to pretend it knows something.
    expect(spoke.band.lo).toBeCloseTo(0.2, 6)
    expect(spoke.band.hi).toBe(1)
  })

  it('narrows the band as the strand is actually worked', () => {
    const bare = buildSpokes([pt('math/base-ten/add-3-digit', { masteryProb: 0.7 })], STRANDS)
    const worked = buildSpokes(
      [pt('math/base-ten/add-3-digit', { masteryProb: 0.7, attempts: 12, evidence: 12, seen: true })],
      STRANDS,
    )
    const w = spokeFor(bare, 'math/base-ten').band
    const t = spokeFor(worked, 'math/base-ten').band
    expect(t.hi - t.lo).toBeLessThan(w.hi - w.lo)
    expect(spokeFor(worked, 'math/base-ten').seen).toBe(true)
  })

  // Mean, not sum: five barely-touched Rooms must not add up to the appearance
  // of one well-established one.
  it('does not let many thin Rooms fake a well-known strand', () => {
    const thin = buildSpokes(
      [
        pt('math/fractions/unit-fraction', { masteryProb: 0.5, evidence: 1, attempts: 1, seen: true }),
        pt('math/fractions/equivalent', { masteryProb: 0.5, evidence: 1, attempts: 1, seen: true }),
        pt('math/fractions/compare', { masteryProb: 0.5, evidence: 1, attempts: 1, seen: true }),
      ],
      STRANDS,
    )
    const deep = buildSpokes(
      [pt('math/base-ten/add-3-digit', { masteryProb: 0.5, evidence: 3, attempts: 3, seen: true })],
      STRANDS,
    )
    const thinBand = spokeFor(thin, 'math/fractions').band
    const deepBand = spokeFor(deep, 'math/base-ten').band
    expect(thinBand.hi - thinBand.lo).toBeGreaterThan(deepBand.hi - deepBand.lo)
  })

  it('counts how much of a strand has really been touched', () => {
    const spokes = buildSpokes(
      [
        pt('math/fractions/unit-fraction', { attempts: 3, evidence: 3, seen: true }),
        pt('math/fractions/equivalent'),
        pt('math/fractions/compare'),
      ],
      STRANDS,
    )
    expect(spokeFor(spokes, 'math/fractions').seenRooms).toBe(1)
    expect(spokeFor(spokes, 'math/fractions').rooms).toBe(3)
    expect(spokeFor(spokes, 'math/fractions').seen).toBe(true)
  })

  // An empty axis reads as "knows nothing here"; the truth would be "the
  // Blueprint has nothing here". Opposite messages to a parent.
  it('drops a strand with no Rooms rather than drawing it at zero', () => {
    const spokes = buildSpokes([pt('math/fractions/compare')], STRANDS)
    expect(spokes.map((s) => s.strandId)).toEqual(['math/fractions'])
  })

  it('keeps the strand order it was given, so the chart does not spin', () => {
    const points = STRANDS.map((s) => pt(`${s.id}/room`))
    expect(buildSpokes(points, STRANDS).map((s) => s.strandId)).toEqual(STRANDS.map((s) => s.id))
    expect(buildSpokes([...points].reverse(), STRANDS).map((s) => s.strandId)).toEqual(
      STRANDS.map((s) => s.id),
    )
  })

  it('carries both labels and the subject, for colour and for language', () => {
    const spoke = spokeFor(buildSpokes([pt('lang/zh/pinyin/tones')], STRANDS), 'lang/zh/pinyin')
    expect(spoke.labelEn).toBe('Pinyin')
    expect(spoke.labelZh).toBe('拼音')
    expect(spoke.subject).toBe('language')
  })

  it('ignores a Room whose strand is not on the chart', () => {
    const spokes = buildSpokes([pt('art/collage/paper')], STRANDS)
    expect(spokes).toEqual([])
  })
})

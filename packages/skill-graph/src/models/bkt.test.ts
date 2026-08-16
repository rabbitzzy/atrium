import { describe, expect, it } from 'vitest'
import {
  applySessionFloor,
  bktUpdate,
  bktUpdateWeighted,
  confidenceBand,
  SESSION_DROP_LIMIT,
  type BktParams,
} from './bkt.js'

/** `math/base-ten/add-3-digit` as seeded by 004 — a free-response numeral Room. */
const ADD3: BktParams = { pL0: 0.35, pT: 0.1, pS: 0.15, pG: 0.1 }

describe('bktUpdateWeighted', () => {
  it('is ordinary BKT at full confidence', () => {
    expect(bktUpdateWeighted(0.35, true, ADD3, 1)).toBeCloseTo(bktUpdate(0.35, true, ADD3), 12)
    expect(bktUpdateWeighted(0.35, false, ADD3, 1)).toBeCloseTo(bktUpdate(0.35, false, ADD3), 12)
  })

  // A page the model could not read must not become evidence about the child.
  it('moves nothing at all when the evaluation is worthless', () => {
    expect(bktUpdateWeighted(0.35, true, ADD3, 0)).toBe(0.35)
    expect(bktUpdateWeighted(0.35, false, ADD3, 0)).toBe(0.35)
  })

  it('moves less, in the same direction, when the grade is shaky', () => {
    const full = bktUpdateWeighted(0.35, true, ADD3, 1)
    const half = bktUpdateWeighted(0.35, true, ADD3, 0.5)
    expect(half).toBeGreaterThan(0.35)
    expect(half).toBeLessThan(full)
    // Interpolation is linear in the weight, so half a grade is half the move.
    expect(half - 0.35).toBeCloseTo((full - 0.35) / 2, 12)
  })

  it('softens a wrong answer the same way it softens a right one', () => {
    const full = bktUpdateWeighted(0.9, false, ADD3, 1)
    const quarter = bktUpdateWeighted(0.9, false, ADD3, 0.25)
    expect(quarter).toBeLessThan(0.9)
    expect(quarter).toBeGreaterThan(full)
  })

  it('treats out-of-range weights as the nearest sane one', () => {
    expect(bktUpdateWeighted(0.35, true, ADD3, 5)).toBeCloseTo(bktUpdate(0.35, true, ADD3), 12)
    expect(bktUpdateWeighted(0.35, true, ADD3, -1)).toBe(0.35)
  })

  it('defaults to full confidence, so an unweighted caller gets plain BKT', () => {
    expect(bktUpdateWeighted(0.35, true, ADD3)).toBeCloseTo(bktUpdate(0.35, true, ADD3), 12)
  })
})

describe('confidenceBand', () => {
  it('is at its widest when the number is only a prior', () => {
    const band = confidenceBand(0.5, 0)
    expect(band.hi - band.lo).toBeCloseTo(1.0, 6)
  })

  it('narrows as evidence accumulates', () => {
    const widths = [0, 4, 20].map((e) => {
      const b = confidenceBand(0.5, e)
      return b.hi - b.lo
    })
    expect(widths[0]!).toBeGreaterThan(widths[1]!)
    expect(widths[1]!).toBeGreaterThan(widths[2]!)
    expect(widths[1]!).toBeCloseTo(0.447, 3)
  })

  // Two Rooms can hold the same number and mean very different things; that
  // difference is the whole reason this function exists.
  it('separates a confident 0.9 from a barely-tested one', () => {
    const green = confidenceBand(0.9, 20)
    const guess = confidenceBand(0.9, 1)
    expect(green.lo).toBeGreaterThan(guess.lo)
  })

  it('never reports a probability outside 0..1', () => {
    for (const [p, e] of [[0.95, 0], [0.02, 0], [1, 5], [0, 5]] as const) {
      const b = confidenceBand(p, e)
      expect(b.lo).toBeGreaterThanOrEqual(0)
      expect(b.hi).toBeLessThanOrEqual(1)
      expect(b.lo).toBeLessThanOrEqual(b.hi)
    }
  })
})

describe('applySessionFloor', () => {
  it('lets a still-learning Room fall as far as the evidence takes it', () => {
    // From a 0.35 prior the natural floor is ~0.128, well inside the bound, so
    // nothing is clipped on the Rooms where the evidence is most informative.
    let p = 0.35
    for (let i = 0; i < 6; i++) p = applySessionFloor(bktUpdate(p, false, ADD3), 0.35)
    expect(p).toBeGreaterThan(0.12)
    expect(p).toBeLessThan(0.14)
  })

  it('stops one bad afternoon from erasing a mastered Room', () => {
    let p = 0.95
    for (let i = 0; i < 5; i++) p = applySessionFloor(bktUpdate(p, false, ADD3), 0.95)
    expect(p).toBeCloseTo(0.95 - SESSION_DROP_LIMIT, 10)
  })

  it('measures the fall from where the Visit began, not from the last question', () => {
    // Ten questions must not walk the number down by SESSION_DROP_LIMIT each.
    const start = 0.9
    let p = start
    for (let i = 0; i < 10; i++) p = applySessionFloor(bktUpdate(p, false, ADD3), start)
    expect(p).toBeCloseTo(start - SESSION_DROP_LIMIT, 10)
  })

  it('never bounds an improvement', () => {
    expect(applySessionFloor(bktUpdate(0.4, true, ADD3), 0.4)).toBeGreaterThan(0.4)
  })

  it('leaves a hand-entered attempt with no Visit unbounded', () => {
    const crashed = bktUpdate(0.95, false, ADD3)
    expect(applySessionFloor(crashed, null)).toBe(crashed)
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isRecordable, toObservations, type GradedQuestion } from './attempts.js'

const q = (number: number, quality: GradedQuestion['quality']): GradedQuestion => ({
  number,
  quality,
})

describe('turning tiers into observations', () => {
  it('sends the two decisive tiers at full strength, in opposite directions', () => {
    const [right, wrong] = toObservations([q(1, 'mastered'), q(2, 'not-yet')])
    assert.equal(right!.correct, true)
    assert.equal(right!.confidence, 1)
    assert.equal(wrong!.correct, false)
    assert.equal(wrong!.confidence, 1)
  })

  // The distinction the tiers exist to make, and the one a straight split down
  // the middle would throw away.
  it('sends the two partial tiers at half strength', () => {
    const [shaky, needsHelp] = toObservations([q(1, 'shaky'), q(2, 'needs-help')])
    assert.equal(shaky!.correct, true)
    assert.equal(shaky!.confidence, 0.5)
    assert.equal(needsHelp!.correct, false)
    assert.equal(needsHelp!.confidence, 0.5)
  })

  it('keeps the order the questions were asked in', () => {
    const out = toObservations([q(3, 'mastered'), q(1, 'not-yet'), q(2, 'shaky')])
    assert.deepEqual(
      out.map((o) => o.number),
      [1, 2, 3],
    )
    // Sequence, not average: this one is a child who worked out what was asked.
    assert.deepEqual(
      out.map((o) => o.correct),
      [false, true, true],
    )
  })

  it('does not collapse a Card into a single verdict', () => {
    const out = toObservations([1, 2, 3, 4, 5].map((n) => q(n, 'mastered')))
    assert.equal(out.length, 5)
  })
})

describe('how sure the grader was', () => {
  it('scales every question when the page was hard to read', () => {
    const clean = toObservations([q(1, 'mastered')])
    const murky = toObservations([q(1, 'mastered')], 0.5)
    assert.equal(clean[0]!.confidence, 1)
    assert.equal(murky[0]!.confidence, 0.5)
    assert.equal(murky[0]!.correct, true, 'direction is unchanged by legibility')
  })

  it('compounds with the tier rather than replacing it', () => {
    const [shaky] = toObservations([q(1, 'shaky')], 0.5)
    assert.equal(shaky!.confidence, 0.25)
  })

  it('defaults to full confidence, which is every caller today', () => {
    assert.equal(toObservations([q(1, 'mastered')])[0]!.confidence, 1)
  })

  it('never sends a zero-weight observation the API would reject', () => {
    for (const c of [0, -1, 0.0001]) {
      const [o] = toObservations([q(1, 'shaky')], c)
      assert.ok(o!.confidence > 0, `confidence ${o!.confidence} for scale ${c}`)
    }
  })

  it('clamps a nonsense confidence rather than amplifying a grade', () => {
    assert.equal(toObservations([q(1, 'mastered')], 5)[0]!.confidence, 1)
  })
})

describe('refusing to record what is not evidence', () => {
  it('drops a question the grader gave no usable tier', () => {
    const junk = [{ number: 1, quality: 'brilliant' }, q(2, 'mastered')] as unknown as GradedQuestion[]
    const out = toObservations(junk)
    assert.equal(out.length, 1)
    assert.equal(out[0]!.number, 2)
  })

  it('drops a question with no real number to key on', () => {
    const junk = [
      { number: 0, quality: 'mastered' },
      { number: NaN, quality: 'mastered' },
    ] as unknown as GradedQuestion[]
    assert.equal(toObservations(junk).length, 0)
  })

  // The roadmap's known failure: the pipeline graded a child's drawing as five
  // imaginary questions. If that ever reaches here it must not move mastery on
  // Rooms the child never worked.
  it('says an empty evaluation is not recordable', () => {
    assert.equal(isRecordable(toObservations([])), false)
    assert.equal(isRecordable(toObservations([{ number: 1, quality: 'nope' } as unknown as GradedQuestion])), false)
  })

  it('says a real evaluation is recordable', () => {
    assert.equal(isRecordable(toObservations([q(1, 'needs-help')])), true)
  })
})

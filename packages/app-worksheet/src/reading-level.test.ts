/**
 * The wording dial (BHCS-14).
 *
 * What is worth testing here is not the prose — that is a prompt, and asserting
 * on its sentences would just be asserting that the file has not been edited.
 * It is the decisions the prose is assembled from: which band a grade lands in,
 * that Chinese never comes out above English, and that the no-grade path — the
 * common one — produces a real brief rather than an apology.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { CaptureContext } from '@atrium/schema'
import { bandForGrade, chineseBand, readingLevelBrief, type Band } from './reading-level'

const ctx = (grade: number | null): CaptureContext => ({
  student: { id: 's1', name: 'Test Student', grade },
})

/** A student the roster returned no grade field for at all, not even a null. */
const ctxWithoutGrade: CaptureContext = { student: { id: 's2', name: 'Unlinked' } }

describe('band from grade', () => {
  test('TK and K floor together at the simplest band', () => {
    // parseGrade maps both to 0, losing the distinction, which nothing uses.
    assert.equal(bandForGrade(0), 'emerging')
  })

  test('each band covers about two grades', () => {
    assert.equal(bandForGrade(1), 'early')
    assert.equal(bandForGrade(2), 'early')
    assert.equal(bandForGrade(3), 'developing')
    assert.equal(bandForGrade(4), 'developing')
    assert.equal(bandForGrade(5), 'fluent')
  })

  test('a grade above the hub clamps rather than running off the end', () => {
    assert.equal(bandForGrade(6), 'fluent')
    assert.equal(bandForGrade(12), 'fluent')
  })

  test('no grade is null, not a guess', () => {
    assert.equal(bandForGrade(null), null)
    assert.equal(bandForGrade(undefined), null)
    assert.equal(bandForGrade(NaN), null)
  })
})

describe('the heritage-learner shift', () => {
  test('Chinese sits one band below English', () => {
    assert.equal(chineseBand('fluent'), 'developing')
    assert.equal(chineseBand('developing'), 'early')
    assert.equal(chineseBand('early'), 'emerging')
  })

  test('and floors instead of falling off the bottom', () => {
    assert.equal(chineseBand('emerging'), 'emerging')
  })
})

describe('the brief', () => {
  const BANDS: Band[] = ['emerging', 'early', 'developing', 'fluent']
  const rank = (b: Band) => BANDS.indexOf(b)

  test('every grade the endpoint can send produces one, naming both levels', () => {
    for (let grade = 0; grade <= 12; grade++) {
      const brief = readingLevelBrief(ctx(grade))
      const english = bandForGrade(grade)!

      assert.match(brief, new RegExp(`English level — ${english}`), `grade ${grade}`)
      assert.match(brief, new RegExp(`Chinese level — ${chineseBand(english)}`), `grade ${grade}`)
    }
  })

  test('Chinese is never pitched above English', () => {
    for (let grade = 0; grade <= 12; grade++) {
      const english = bandForGrade(grade)!
      assert.ok(rank(chineseBand(english)) <= rank(english), `grade ${grade}`)
    }
  })

  test('grade 0 is described the way the school says it, not as "grade 0"', () => {
    const brief = readingLevelBrief(ctx(0))
    assert.match(brief, /TK or kindergarten/)
    assert.doesNotMatch(brief, /grade 0/)
  })

  test('the common case — no grade — asks for the handwriting to be read', () => {
    // A null grade and an absent one are the same fact and take the same path:
    // the roster sends null, the unlinked check-in sends nothing at all.
    for (const brief of [readingLevelBrief(ctx(null)), readingLevelBrief(ctxWithoutGrade)]) {
      assert.doesNotMatch(brief, /grade \d/, 'must not invent a grade it was not given')
      assert.match(brief, /handwriting/)
      // The whole point of the null path: it is a strategy, not a shortfall.
      assert.ok(brief.length > 400)
    }
  })

  test('the rules that hold at every level are in every brief', () => {
    for (const c of [ctx(null), ctxWithoutGrade, ctx(0), ctx(3), ctx(5)]) {
      const brief = readingLevelBrief(c)

      // Two levels, the diagnosis unsoftened, and no dial the student can see.
      assert.match(brief, /Two reading levels, not one/)
      assert.match(brief, /never a smaller finding/)
      assert.match(brief, /Never mention any of this/)
      assert.match(brief, /next_focus/)
    }
  })
})

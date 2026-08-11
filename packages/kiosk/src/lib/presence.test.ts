/**
 * The one piece of the idle timer with a decision in it: which of the three
 * states a given silence means. The listeners and the interval around it are
 * browser plumbing, tested by a mock of themselves and nothing else.
 */

import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, test } from 'node:test'

import { IDLE_ASK_MS, IDLE_GRACE_MS, presenceAfter } from './presence'

describe('deciding whether anyone is still at the station', () => {
  test('a student who just touched something is here', () => {
    deepStrictEqual(presenceAfter(0), { state: 'here' })
  })

  test('a long silence is still not enough to end a visit on its own', () => {
    // Three and a half minutes of stillness is a child reading a Debrief, not
    // an empty room. Nothing may happen to the screen yet.
    deepStrictEqual(presenceAfter(IDLE_ASK_MS - 1), { state: 'here' })
  })

  test('the question comes up the moment the threshold is crossed', () => {
    deepStrictEqual(presenceAfter(IDLE_ASK_MS), {
      state: 'asking',
      secondsLeft: IDLE_GRACE_MS / 1000,
    })
  })

  test('the countdown reaches one before it runs out, never zero', () => {
    strictEqual(presenceAfter(IDLE_ASK_MS + IDLE_GRACE_MS - 1).state, 'asking')
    deepStrictEqual(presenceAfter(IDLE_ASK_MS + IDLE_GRACE_MS - 1), {
      state: 'asking',
      secondsLeft: 1,
    })
  })

  test('an unanswered question ends the visit', () => {
    deepStrictEqual(presenceAfter(IDLE_ASK_MS + IDLE_GRACE_MS), { state: 'gone' })
    // A laptop lid closed over a live session comes back to a stale clock, not
    // to a negative one — hours of silence must land in the same state as the
    // first second past the deadline.
    deepStrictEqual(presenceAfter(6 * 60 * 60_000), { state: 'gone' })
  })
})

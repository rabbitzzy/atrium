/**
 * The parser's contract, stated as the two properties that matter at the
 * kiosk: nothing on screen ever rewrites itself, and everything that has
 * finished arriving is on screen.
 *
 * The last test is the real one — it replays an actual worksheet evaluation
 * one character at a time and asserts both properties across every single
 * intermediate state.
 */

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, test } from 'node:test'

import { parsePartialJson } from './partial-json'

describe('complete documents parse as themselves', () => {
  const cases: unknown[] = [
    {},
    [],
    { a: 1 },
    { a: [1, 2, 3], b: { c: 'd' } },
    { n: null, t: true, f: false, neg: -2.5, exp: 1e3 },
    { 'zh 中文': 'the "quoted" \\ path\nnewline' },
    [{ number: 1 }, { number: 2 }],
  ]

  for (const value of cases) {
    test(JSON.stringify(value), () => {
      deepStrictEqual(parsePartialJson(JSON.stringify(value)), value)
    })
  }
})

describe('nothing to show yet', () => {
  for (const text of ['', '   ', '"unterminat', 'tru']) {
    test(JSON.stringify(text), () => strictEqual(parsePartialJson(text), undefined))
  }

  test('a member that has not finished its key or value is not a member', () => {
    // The object itself is real from `{` onward — it is the member that waits.
    for (const text of ['{', '{"key', '{"key"', '{"key":']) {
      deepStrictEqual(parsePartialJson(text), {})
    }
  })

  test('an unfinished string is dropped, not shown as a prefix', () => {
    deepStrictEqual(parsePartialJson('{"a":"done","b":"half'), { a: 'done' })
  })

  test('a number at the buffer edge is dropped — it could still grow', () => {
    // The alternative is showing question 3 and revising it to 31.
    deepStrictEqual(parsePartialJson('{"a":1,"b":3'), { a: 1 })
    deepStrictEqual(parsePartialJson('{"a":1,"b":3}'), { a: 1, b: 3 })
    deepStrictEqual(parsePartialJson('{"a":1,"b":3,'), { a: 1, b: 3 })
  })
})

describe('containers are kept while they fill', () => {
  test('an element that has started shows the fields it has', () => {
    deepStrictEqual(parsePartialJson('{"q":[{"n":1,"t":"ok"},{"n":2,"t":"pa'), {
      q: [{ n: 1, t: 'ok' }, { n: 2 }],
    })
  })

  test('an element that has only just opened is still an element', () => {
    // Worth surfacing: it is how the kiosk knows to put the next row on screen.
    deepStrictEqual(parsePartialJson('{"q":[{"n":1,"t":"ok"},{'), { q: [{ n: 1, t: 'ok' }, {}] })
  })

  test('nesting stays partial all the way down', () => {
    deepStrictEqual(parsePartialJson('{"a":{"b":{"c":[1,2'), { a: { b: { c: [1] } } })
  })

  test('whitespace between tokens is irrelevant', () => {
    deepStrictEqual(parsePartialJson('{\n  "a" : [ 1 , 2 ] ,\n  "b" : "x'), { a: [1, 2] })
  })
})

/** A real (abridged) worksheet evaluation, in the field order the schema pins. */
const EVALUATION = {
  questions: [
    {
      number: 1,
      quality: 'mastered',
      transcript: '3 + 4 = 7',
      misconception: null,
      suggestion: null,
    },
    {
      number: 2,
      quality: 'shaky',
      transcript: '12 - 5 = 8',
      misconception: 'Counted back one step short',
      suggestion: 'Try counting down on your fingers: 11, 10, 9, 8, 7.',
    },
  ],
  overall_quality: 'shaky',
  summary_en: 'You got the addition right away — nice work!',
  summary_zh: '加法做得很好！',
  next_focus: 'Subtraction within 20',
}

describe('replayed one character at a time', () => {
  const full = JSON.stringify(EVALUATION)
  const snapshots = Array.from({ length: full.length + 1 }, (_, i) =>
    parsePartialJson(full.slice(0, i)),
  )

  test('the last snapshot is the whole evaluation', () => {
    deepStrictEqual(snapshots.at(-1), EVALUATION)
  })

  test('every snapshot is a prefix of the next — nothing is ever revised', () => {
    for (let i = 1; i < snapshots.length; i++) {
      const [prev, next] = [snapshots[i - 1], snapshots[i]]
      if (prev === undefined) continue
      ok(
        grows(prev, next),
        `snapshot ${i} revised an earlier value\n  after ${full.slice(0, i - 1)}\n  ${JSON.stringify(prev)}\n  ${JSON.stringify(next)}`,
      )
    }
  })

  test('a question is readable well before the sheet finishes', () => {
    // The claim the ticket rests on: question 1 is on screen while the rest is
    // still arriving. Anything past ~60% would not be worth the machinery.
    const readable = snapshots.findIndex(
      (s) => (s as typeof EVALUATION | undefined)?.questions?.[0]?.transcript !== undefined,
    )
    ok(readable > 0 && readable < full.length * 0.4, `first answer readable at ${readable}/${full.length}`)
  })
})

/**
 * Whether `next` only adds to `prev`: every value already present is still
 * present and unchanged. Containers may grow; scalars may not change.
 */
function grows(prev: unknown, next: unknown): boolean {
  if (Array.isArray(prev)) {
    return (
      Array.isArray(next) && next.length >= prev.length && prev.every((v, i) => grows(v, next[i]))
    )
  }
  if (prev !== null && typeof prev === 'object') {
    if (next === null || typeof next !== 'object' || Array.isArray(next)) return false
    const n = next as Record<string, unknown>
    return Object.entries(prev).every(([k, v]) => k in n && grows(v, n[k]))
  }
  return Object.is(prev, next)
}

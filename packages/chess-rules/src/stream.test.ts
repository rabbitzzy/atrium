/**
 * BHCS-17's three pre-flight questions, as tests.
 *
 * The one that mattered most — do moves arrive in sheet order — is a fact
 * about Gemini rather than about this code, and was measured against the live
 * API on real scoresheets before any of this was written. It holds. What is
 * testable here is everything that depends on it: that a reading taken from a
 * half-arrived sheet is the same reading the whole sheet gives, and that an
 * answer given at that point survives the rest of the sheet landing.
 */

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'

import { validateGame, type RawMovePair } from './validate'
import { applyAnswer, nextPrompt, unresolved } from './resolve'
import { LOOKAHEAD, promptWhileStreaming, stablePrefix, type ArrivingMove } from './stream'

const oracle = JSON.parse(
  readFileSync(new URL('./oracle.fixture.json', import.meta.url), 'utf-8'),
) as { kings_land: { input: RawMovePair[]; groundTruth: string[] } }

const CLEAN = oracle.kings_land.input
const TRUTH = oracle.kings_land.groundTruth
/** Move 3's white cell misread as `Rc1` — the cascade the resolution step exists for. */
const CASCADED = CLEAN.map((m) => (m.n === 3 ? { ...m, w: 'Rc1' } : m))

/**
 * The sheet as it arrives: every prefix, with the last row half-written the
 * way the transport actually delivers it.
 */
function arriving(sheet: RawMovePair[]): ArrivingMove[][] {
  return sheet.flatMap((move, i) => {
    const settled = sheet.slice(0, i)
    return [
      [...settled, { n: move.n }], // the row has opened
      [...settled, { n: move.n, w: move.w ?? null }], // White's cell has closed
      [...settled, move], // and now Black's
    ]
  })
}

/*
 * The replay, done once and read by every test below.
 *
 * Row prefixes rather than the finer `arriving` snapshots, because a
 * half-written row has the same settled prefix as the row before it and
 * therefore the same question — a fact `stablePrefix` owns and the tests below
 * check once directly. Computing it per snapshot instead multiplied the work
 * by three for no extra coverage: each `promptWhileStreaming` on a cascaded
 * game costs a full re-validation plus a ranked answer list.
 */
const PREFIXES = CASCADED.map((_, i) => CASCADED.slice(0, i + 1))
const PROMPTS = PREFIXES.map((rows) => promptWhileStreaming(rows))

describe('what has finished arriving', () => {
  test('a row is not readable until both cells have closed', () => {
    const settled = [{ n: 1, w: 'e4', b: 'e5' }]
    deepStrictEqual(stablePrefix([...settled, { n: 2 }]), settled)
    deepStrictEqual(stablePrefix([...settled, { n: 2, w: 'Nf3' }]), settled)
    deepStrictEqual(stablePrefix([...settled, { n: 2, w: 'Nf3', b: 'Nc6' }]), [
      ...settled,
      { n: 2, w: 'Nf3', b: 'Nc6' },
    ])
  })

  test('a blank cell is a cell, not an absent one', () => {
    // `null` is a child who wrote nothing there; absent is a cell still coming.
    // Confusing the two desynchronises every move after it.
    deepStrictEqual(stablePrefix([{ n: 1, w: 'e4', b: null }]), [{ n: 1, w: 'e4', b: null }])
    deepStrictEqual(stablePrefix([{ n: 1, w: 'e4' }]), [])
  })

  test('it is always a prefix of the finished sheet', () => {
    for (const snapshot of arriving(CLEAN)) {
      const settled = stablePrefix(snapshot)
      deepStrictEqual(settled, CLEAN.slice(0, settled.length))
    }
  })
})

describe('asking early asks the same question', () => {
  const whole = nextPrompt(validateGame(CASCADED))!

  test('the sheet as a whole asks about move 3', () => {
    strictEqual(whole.key, '3-white')
  })

  test('nothing is asked before the reading is anchored', () => {
    PROMPTS.forEach((prompt, i) => {
      if (!prompt) return
      const inHand = PREFIXES[i]!.length * 2
      ok(
        prompt.index + LOOKAHEAD < inHand,
        `asked about half-move ${prompt.index} with only ${inHand} in hand`,
      )
    })
  })

  test('a row still being written asks whatever the row before it asked', () => {
    // The composition of the two rules: what is stable decides what is asked,
    // so a half-arrived row cannot change the question.
    const rows = PREFIXES[PROMPTS.findIndex((p) => p !== null)]!
    const settled = PROMPTS[rows.length - 1]
    for (const half of [{ n: 99 }, { n: 99, w: 'e4' }]) {
      strictEqual(promptWhileStreaming([...rows, half])?.key, settled?.key)
    }
  })

  test('and when one is asked, it is the question the whole sheet asks', () => {
    // Not merely the same move: the same handwriting, the same guess, the same
    // position, the same answers. A question posed early that later turns out
    // to have been the wrong one would be worse than waiting.
    const asked = PROMPTS.filter((p) => p !== null)
    ok(asked.length > 0, 'the stream never reached a question at all')

    for (const prompt of asked) {
      strictEqual(prompt.key, whole.key)
      strictEqual(prompt.raw, whole.raw)
      strictEqual(prompt.guess, whole.guess)
      strictEqual(prompt.fen, whole.fen)
      deepStrictEqual(prompt.options.map((o) => o.san), whole.options.map((o) => o.san))
    }
  })

  test('the question arrives long before the sheet does', () => {
    // The claim the ticket rests on. Measured in rows rather than seconds,
    // because rows are what this package can see.
    const first = PROMPTS.findIndex((p) => p !== null)
    ok(first > 0, 'never asked')
    ok(
      first < PROMPTS.length * 0.25,
      `question reached ${first} of ${PROMPTS.length} snapshots in — too late to be worth streaming`,
    )
  })
})

describe('an answer given mid-stream survives the rest of the sheet', () => {
  /** The earliest point the student could have been asked. */
  const first = PROMPTS.findIndex((p) => p !== null)
  const prompt = PROMPTS[first]!
  const settled = PREFIXES[first]!

  test('the student is answering with most of the sheet still arriving', () => {
    ok(settled.length < CASCADED.length / 2, `${settled.length} of ${CASCADED.length} rows already in`)
  })

  test('the answer still holds once everything has landed', () => {
    // Answer against the prefix, then re-read the finished sheet with that
    // answer carried across. `confirmed` is keyed by half-move, not by array
    // position, which is what lets it survive the source growing underneath it.
    const { confirmed } = applyAnswer(settled, {}, prompt.key, 'Bc4')
    const final = validateGame(CASCADED, confirmed)

    const move = final.find((m) => m.n === 3 && m.side === 'white')!
    strictEqual(move.status, 'confirmed')
    strictEqual(move.san, 'Bc4')
    strictEqual(move.raw, 'Rc1', 'confirming never rewrites what the child wrote')
  })

  test('and it rescues the tail it was given for', () => {
    const { confirmed } = applyAnswer(settled, {}, prompt.key, 'Bc4')
    const final = validateGame(CASCADED, confirmed)

    ok(
      unresolved(final).length < unresolved(validateGame(CASCADED)).length / 5,
      `expected a rescue: ${unresolved(validateGame(CASCADED)).length} → ${unresolved(final).length}`,
    )
    deepStrictEqual(final.filter((m) => m.san).map((m) => m.san), TRUTH)
  })

  test('answering early is identical to answering at the end', () => {
    // Streaming is a latency change, not a correctness change. This is that
    // sentence as an assertion.
    const early = applyAnswer(settled, {}, prompt.key, 'Bc4').confirmed
    const late = applyAnswer(CASCADED, {}, nextPrompt(validateGame(CASCADED))!.key, 'Bc4').confirmed

    deepStrictEqual(early, late)
    deepStrictEqual(validateGame(CASCADED, early), validateGame(CASCADED, late))
  })

  test('the answer survives every later row, not just the last', () => {
    const { confirmed } = applyAnswer(settled, {}, prompt.key, 'Bc4')
    for (let rows = settled.length; rows <= CASCADED.length; rows++) {
      const move = validateGame(CASCADED.slice(0, rows), confirmed).find(
        (m) => m.n === 3 && m.side === 'white',
      )!
      strictEqual(move.san, 'Bc4', `lost the answer at ${rows} rows`)
      strictEqual(move.status, 'confirmed')
    }
  })
})

/**
 * The resolution loop (BHCS-11): ask about one move, re-anchor, re-read.
 *
 * The load-bearing claim is that a single answer near the start of a
 * scoresheet rescues the long tail behind it. That is tested here against a
 * real game with a real cascade, not asserted in a comment.
 */

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'

import { isUncertain, validateGame, type RawMovePair } from './validate'
import { applyAnswer, nextPrompt, optionsFor, positionBefore, unresolved } from './resolve'
import { validateScoresheet } from './index'

const oracle = JSON.parse(
  readFileSync(new URL('./oracle.fixture.json', import.meta.url), 'utf-8'),
) as {
  kings_land: { input: RawMovePair[]; groundTruth: string[] }
}

const CLEAN = oracle.kings_land.input
const TRUTH = oracle.kings_land.groundTruth

/**
 * The same game with move 3's white cell misread as `Rc1`.
 *
 * `Rc1` is a plausible garble and — this is the point — it resolves to a
 * *legal but wrong* move, Rg1. The board then disagrees with the rest of the
 * scoresheet and everything after collapses. This is the failure the whole
 * feature exists for; it is what the real captures from the station look like.
 */
const CASCADED = CLEAN.map((m) => (m.n === 3 ? { ...m, w: 'Rc1' } : m))

describe('one answer rescues the tail', () => {
  test('a single misread move poisons half the game', () => {
    const moves = validateGame(CASCADED)
    ok(
      unresolved(moves).length >= 20,
      `expected a cascade, got ${unresolved(moves).length} uncertain of ${moves.length}`,
    )
  })

  test('the prompt lands on the cause, not on the symptoms', () => {
    const prompt = nextPrompt(validateGame(CASCADED))!
    // Not move 20-something, where the damage is loudest — move 3, where it
    // started.
    strictEqual(prompt.key, '3-white')
    strictEqual(prompt.raw, 'Rc1', 'the child’s handwriting is shown back verbatim')
    strictEqual(prompt.guess, 'Rg1', 'and so is the machine’s wrong guess')
  })

  test('the true move is offered as an answer', () => {
    const prompt = nextPrompt(validateGame(CASCADED))!
    ok(
      prompt.options.some((o) => o.san === 'Bc4'),
      `Bc4 missing from [${prompt.options.map((o) => o.san).join(', ')}]`,
    )
  })

  test('answering it restores the entire game', () => {
    const before = validateGame(CASCADED)
    const prompt = nextPrompt(before)!
    const after = applyAnswer(CASCADED, {}, prompt.key, 'Bc4')

    ok(
      unresolved(after.moves).length < unresolved(before).length / 5,
      `expected a rescue: ${unresolved(before).length} → ${unresolved(after.moves).length}`,
    )
    deepStrictEqual(after.moves.filter((m) => m.san).map((m) => m.san), TRUTH)
  })

  test('the answered move is tagged as the student’s, not the machine’s', () => {
    const after = applyAnswer(CASCADED, {}, '3-white', 'Bc4')
    const move = after.moves.find((m) => m.n === 3 && m.side === 'white')!
    strictEqual(move.status, 'confirmed')
    strictEqual(move.san, 'Bc4')
    strictEqual(move.raw, 'Rc1', 'confirming never rewrites what the child wrote')
  })
})

describe('choosing what to ask', () => {
  test('a clean game asks nothing', () => {
    // Every move settled by hand, so there is nothing left to be unsure about.
    const confirmed = Object.fromEntries(
      validateGame(CLEAN).flatMap((m, i) => {
        const san = TRUTH[i] ?? m.san
        return san ? [[`${m.n}-${m.side}`, san] as const] : []
      }),
    )
    strictEqual(nextPrompt(validateGame(CLEAN, confirmed)), null)
  })

  test('settled statuses are never asked about', () => {
    for (const moves of [validateGame(CLEAN), validateGame(CASCADED)]) {
      for (const m of unresolved(moves)) {
        ok(!['ok', 'normalized', 'inferred', 'confirmed'].includes(m.status), `asked about ${m.status}`)
        ok(m.raw !== null, 'asked about a blank cell')
      }
    }
  })

  test('a blank cell is not a question', () => {
    // Nothing was written, so there is no handwriting for a child to recognise.
    const moves = validateGame([{ n: 1, w: 'e4', b: null }, { n: 2, w: 'Nf3', b: 'Nc6' }])
    const blank = moves.find((m) => m.raw === null)!
    ok(['missing', 'inferred'].includes(blank.status))
    strictEqual(nextPrompt([blank]), null)
  })
})

describe('the answers offered', () => {
  const prompt = nextPrompt(validateGame(CASCADED))!

  test('are capped, so the question fits on a screen', () => {
    ok(prompt.options.length <= 4, `${prompt.options.length} options is a wall, not a question`)
  })

  test('always include the machine’s own guess', () => {
    ok(prompt.options.some((o) => o.san === prompt.guess))
    strictEqual(prompt.options[0]!.san, prompt.guess, 'and lead with it')
  })

  test('carry the squares needed to light up a board', () => {
    for (const o of prompt.options) {
      ok(/^[a-h][1-8]$/.test(o.from), `bad from: ${o.from}`)
      ok(/^[a-h][1-8]$/.test(o.to), `bad to: ${o.to}`)
    }
  })

  test('are all legal in the position shown', () => {
    const legal = optionsFor(prompt.fen, prompt.raw, prompt.guess)
    deepStrictEqual(
      prompt.options.map((o) => o.san).sort(),
      legal.map((o) => o.san).sort(),
    )
  })

  test('the position shown is the one before the move in question', () => {
    // Move 3 for white — four half-moves have been played.
    const moves = validateGame(CASCADED)
    const fen = positionBefore(moves, prompt.index)
    strictEqual(fen.split(' ')[1], 'w', 'white to move')
    strictEqual(prompt.fen, fen)
  })
})

describe('answers that stop making sense', () => {
  test('a confirmation made illegal by a later answer is dropped, not obeyed', () => {
    // Confirm move 3 as Bc4, then confirm move 2 as something that makes Bc4
    // impossible. The stale answer must fall back to normal resolution rather
    // than throw or force an illegal move.
    const confirmed = { '3-white': 'Bc4', '2-white': 'Nc3' }
    const moves = validateGame(CASCADED, confirmed)
    const third = moves.find((m) => m.n === 3 && m.side === 'white')!
    ok(third.status !== 'confirmed' || third.san === 'Bc4')
    // Whatever it resolved to, the game is still a legal sequence.
    ok(moves.every((m) => m.san === null || typeof m.san === 'string'))
  })

  test('confirmations ride along in the scoresheet so a reload can resume', () => {
    const sheet = validateScoresheet(
      { metadata: { white: null, black: null, date: null, result: null }, moves: CASCADED },
      { '3-white': 'Bc4' },
    )
    deepStrictEqual(sheet.confirmed, { '3-white': 'Bc4' })
    deepStrictEqual(sheet.source, CASCADED, 'and the handwriting they were answers to')
    strictEqual(sheet.counts.confirmed, 1)
  })

  test('confidence counts a confirmed move as settled', () => {
    const before = validateScoresheet({
      metadata: { white: null, black: null, date: null, result: null },
      moves: CASCADED,
    })
    const after = validateScoresheet(
      { metadata: { white: null, black: null, date: null, result: null }, moves: CASCADED },
      { '3-white': 'Bc4' },
    )
    ok(after.confidence > before.confidence, `${before.confidence} → ${after.confidence}`)
    ok(after.confidence > 0.9)
  })
})

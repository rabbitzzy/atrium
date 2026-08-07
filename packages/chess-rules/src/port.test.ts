/**
 * Port fidelity, against chess-karma itself.
 *
 * `oracle.fixture.json` is the *Python's* output, dumped by running
 * `parser.generate_candidates` and `validator.validate_game` over two real
 * scoresheets and a set of probe strings. It is not a hand-written expectation
 * — it is the behavior this package exists to reproduce, recorded verbatim.
 *
 * Regenerate it with, from ~/src/chess-karma:
 *     .venv/bin/python /tmp/dump_oracle.py
 *
 * A failure here means the port diverged, and the interesting part of the
 * failure is *which* move: a status changing from `ok` to `corrected` is a
 * confidence regression even when the SAN still comes out right.
 */

import { deepStrictEqual, strictEqual, ok } from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test, describe } from 'node:test'

import { generateCandidates, normalizeRaw } from './normalize'
import { sequenceRatio } from './similarity'
import { validateGame, type ValidatedMove } from './validate'
import { countByStatus, validateScoresheet } from './index'

interface Oracle {
  kings_land: { input: { n: number; w: string | null; b: string | null }[]; groundTruth: string[]; expected: ValidatedMove[] }
  img_7777: { input: { n: number; w: string | null; b: string | null }[]; expected: ValidatedMove[] }
  parser: { raw: string; normalized: string | null; candidates: string[] }[]
}

const oracle = JSON.parse(
  readFileSync(new URL('./oracle.fixture.json', import.meta.url), 'utf-8'),
) as Oracle

describe('parser, against the Python', () => {
  for (const probe of oracle.parser) {
    test(`normalizeRaw(${JSON.stringify(probe.raw)})`, () => {
      strictEqual(normalizeRaw(probe.raw), probe.normalized)
    })
    test(`generateCandidates(${JSON.stringify(probe.raw)})`, () => {
      // Order matters: the index of the winning candidate is what separates
      // an `ok` move from a `normalized` one.
      deepStrictEqual(generateCandidates(probe.raw), probe.candidates)
    })
  }
})

describe('validator, against the Python', () => {
  for (const name of ['kings_land', 'img_7777'] as const) {
    test(`${name}: every half-move matches, status included`, () => {
      const actual = validateGame(oracle[name].input)
      strictEqual(actual.length, oracle[name].expected.length, 'half-move count')
      for (let i = 0; i < actual.length; i++) {
        deepStrictEqual(actual[i], oracle[name].expected[i], `half-move ${i} (${JSON.stringify(actual[i])})`)
      }
    })
  }

  /*
   * The reason move-generation order is reproduced rather than left to
   * chess.js. Both fixtures contain cells where every legal move scores zero
   * similarity, so the winner is whichever the generator offered first — and
   * once one such coin flip lands differently, the position drifts and every
   * later move diverges too. This is the assertion that would catch it.
   */
  test('no divergence anywhere, in either fixture', () => {
    for (const name of ['kings_land', 'img_7777'] as const) {
      const actual = validateGame(oracle[name].input)
      const diverged = actual
        .map((m, i) => (m.san === oracle[name].expected[i]!.san ? null : i))
        .filter((i): i is number => i !== null)
      deepStrictEqual(diverged, [], `${name} diverged at half-moves ${diverged.join(', ')}`)
    }
  })
})

describe('the King’s Land scoresheet', () => {
  const results = validateGame(oracle.kings_land.input)

  test('reproduces the ground-truth game', () => {
    deepStrictEqual(results.filter((r) => r.san).map((r) => r.san), oracle.kings_land.groundTruth)
  })

  test('no move fails', () => {
    deepStrictEqual(results.filter((r) => r.status === 'failed'), [])
  })

  test('the known-hard cells resolve, and are flagged honestly', () => {
    const at = (n: number, side: 'white' | 'black') =>
      results.find((r) => r.n === n && r.side === side)!

    // 'bc4' → Bc4: the b-pawn/bishop ambiguity from the ticket.
    strictEqual(at(3, 'white').san, 'Bc4')
    // 'NVH6' → Nh6: stray characters stripped.
    strictEqual(at(4, 'black').san, 'Nh6')
    // '0-0' → O-O: zero versus letter O.
    strictEqual(at(5, 'white').san, 'O-O')
    // 'A3' → a3: an uppercase pawn file.
    strictEqual(at(6, 'white').san, 'a3')
    // 'Bb2' → Bxb2: the omitted capture x, and it stays full confidence,
    // because python-chess's SAN grammar treats the x as optional.
    strictEqual(at(9, 'white').san, 'Bxb2')
    strictEqual(at(9, 'white').status, 'ok')
    // '6xb2' → cxb2 and 'No7+' → Ne7+ only resolve via the similarity pass,
    // so they are exactly the moves a human should look at.
    strictEqual(at(8, 'black').san, 'cxb2')
    strictEqual(at(8, 'black').status, 'corrected')
    strictEqual(at(22, 'white').san, 'Ne7+')
    strictEqual(at(22, 'white').status, 'corrected')
  })

  test('stops at checkmate rather than inventing moves', () => {
    strictEqual(results.length, 47)
    strictEqual(results[results.length - 1]!.san, 'Bxg7#')
  })
})

describe('difflib parity', () => {
  // Ratios taken from Python: difflib.SequenceMatcher(None, a, b).ratio()
  const cases: [string, string, number][] = [
    ['', '', 1],
    ['abc', 'abc', 1],
    ['abc', 'abd', 2 / 3],
    ['b94', 'b4', 0.8],
    ['no7', 'ne7', 2 / 3],
    ['6b2', 'cb2', 2 / 3],
    ['abcd', 'dcba', 0.25],
    ['nvh6', 'nh6', 6 / 7],
  ]
  for (const [a, b, expected] of cases) {
    test(`ratio(${JSON.stringify(a)}, ${JSON.stringify(b)})`, () => {
      ok(Math.abs(sequenceRatio(a, b) - expected) < 1e-12, `got ${sequenceRatio(a, b)}, want ${expected}`)
    })
  }
})

describe('the pipeline shape', () => {
  test('counts and confidence describe the same moves', () => {
    const out = validateScoresheet({
      metadata: { white: 'Chris', black: 'Arthur', date: null, result: '1-0' },
      moves: oracle.kings_land.input,
    })
    deepStrictEqual(out.counts, countByStatus(out.moves))
    strictEqual(out.counts.ok + out.counts.normalized + out.counts.corrected, out.moves.length)
    strictEqual(out.metadata.white, 'Chris')
    ok(out.confidence > 0.9 && out.confidence <= 1)
  })

  test('an empty scoresheet is not an error', () => {
    const out = validateScoresheet({
      metadata: { white: null, black: null, date: null, result: null },
      moves: [],
    })
    deepStrictEqual(out.moves, [])
    strictEqual(out.confidence, 0)
  })

  test('unreadable text fails that move without derailing the rest', () => {
    const out = validateScoresheet({
      metadata: { white: null, black: null, date: null, result: null },
      moves: [{ n: 1, w: 'e4', b: '@@@' }, { n: 2, w: 'Nf3', b: 'Nc6' }],
    })
    strictEqual(out.moves[0]!.status, 'ok')
    // '@@@' cannot be a move, but the moves after it still resolve against the
    // position it left behind.
    ok(out.moves[1]!.status !== 'ok')
    strictEqual(out.moves[2]!.san, 'Nf3')
  })

  test('the raw text is preserved on every move, resolved or not', () => {
    const out = validateScoresheet({
      metadata: { white: null, black: null, date: null, result: null },
      moves: oracle.kings_land.input,
    })
    for (const m of out.moves) {
      const src = oracle.kings_land.input.find((i) => i.n === m.n)!
      strictEqual(m.raw, m.side === 'white' ? src.w : src.b)
    }
  })
})

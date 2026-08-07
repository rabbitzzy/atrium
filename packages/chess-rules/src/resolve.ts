/**
 * Choosing what to ask a student, and folding their answer back in (BHCS-11).
 *
 * The design follows a property of the data rather than a hunch. Confidence on
 * a real scoresheet does not decay gradually — it collapses. A capture from
 * this station reads like:
 *
 *     . . ~ . ~ ~ ~ ~ . ~ ~ . . ! ~ ~ ! ! ! ! ! ! ! ! ! ! ! !
 *                             ^ from here on, almost everything
 *                               is a guess
 *
 * That is one bad cell desynchronising the board, after which every later move
 * fails to parse and falls through to the similarity pass. So the useful
 * question is not "which of these fifty moves is wrong" — it is "what happened
 * at move fourteen". Ask there, re-anchor, and the tail usually resolves
 * itself.
 *
 * Everything here is pure. It runs in the capture function and in the browser
 * unchanged, which is what lets the kiosk re-validate between each answer
 * without a network round trip per confirmation.
 */

import { Chess } from 'chess.js'
import { generateCandidates } from './normalize'
import { sanSimilarity } from './similarity'
import { parseSan, validateGame } from './validate'
import {
  isUncertain,
  moveKey,
  type ConfirmedMoves,
  type RawMovePair,
  type ValidatedMove,
} from './status'

/** One move the student could have meant, offered as an answer. */
export interface MoveOption {
  san: string
  /** Origin and destination, for lighting up the board. */
  from: string
  to: string
  /** How much this looks like what they wrote, 0–1. Ranking only. */
  similarity: number
}

/** A single question: this move, from this position, with these answers. */
export interface ResolutionPrompt {
  /** Index into the validated move list, so an answer can be placed exactly. */
  index: number
  /** Identifies the half-move across re-validations. */
  key: string
  n: number
  side: 'white' | 'black'
  /** What the child actually wrote. Shown verbatim — never cleaned up. */
  raw: string
  /** What the machine guessed, if it managed one. */
  guess: string | null
  /** The position immediately before this move, for the board. */
  fen: string
  /** Ranked answers, best first. */
  options: MoveOption[]
}

/**
 * How many answers to offer.
 *
 * Few enough to read at a glance, and to fit as buttons a child can hit. The
 * full legal move list at a mid-game position is thirty-odd options, which is
 * not a question, it is a wall.
 */
const MAX_OPTIONS = 4

/**
 * The position immediately before a given half-move.
 *
 * Replayed from the resolved moves rather than tracked alongside them, so this
 * stays a pure function of the validated list and cannot fall out of sync with
 * it.
 */
export function positionBefore(moves: ValidatedMove[], index: number): string {
  const board = new Chess()
  for (let i = 0; i < index; i++) {
    const uci = moves[i]?.uci
    if (!uci) continue
    const promotion = uci.slice(4)
    board.move(
      promotion
        ? { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion }
        : { from: uci.slice(0, 2), to: uci.slice(2, 4) },
    )
  }
  return board.fen()
}

/**
 * The answers to offer for a half-move, best first.
 *
 * Ranked by the same similarity the validator uses, so the option a student is
 * most likely to want is the one nearest their handwriting — and the machine's
 * own guess, whatever it was, is always among them rather than hidden.
 */
export function optionsFor(fen: string, raw: string, guess: string | null): MoveOption[] {
  const board = new Chess(fen)

  const scored = board
    .moves({ verbose: true })
    .map((m) => ({ san: m.san, from: m.from, to: m.to, similarity: sanSimilarity(raw, m.san) }))
    .sort((a, b) => b.similarity - a.similarity || a.san.localeCompare(b.san))

  // Anything the parser's own candidates reach is a stronger answer than a
  // similarity score alone suggests — those encode the specific mistakes kids
  // actually make, like a dropped capture x or a lowercase bishop.
  const fromCandidates = new Set<string>()
  for (const candidate of generateCandidates(raw)) {
    const move = parseSan(board.moves({ verbose: true }), candidate)
    if (move) fromCandidates.add(move.san)
  }

  const ranked = [
    ...scored.filter((m) => m.san === guess),
    ...scored.filter((m) => m.san !== guess && fromCandidates.has(m.san)),
    ...scored.filter((m) => m.san !== guess && !fromCandidates.has(m.san)),
  ]

  return ranked.slice(0, MAX_OPTIONS)
}

/**
 * The next question to ask, or null when there is nothing worth asking.
 *
 * Deliberately returns *one* prompt rather than a list. Each answer changes
 * the position every later move is read against, so a list computed now would
 * be answering questions that may no longer exist.
 */
export function nextPrompt(moves: ValidatedMove[]): ResolutionPrompt | null {
  const index = moves.findIndex(isUncertain)
  if (index === -1) return null

  const move = moves[index]!
  if (move.raw === null) return null

  const fen = positionBefore(moves, index)
  const options = optionsFor(fen, move.raw, move.san)
  // A position with no legal moves has no question in it.
  if (options.length === 0) return null

  return {
    index,
    key: moveKey(move.n, move.side),
    n: move.n,
    side: move.side,
    raw: move.raw,
    guess: move.san,
    fen,
    options,
  }
}

/**
 * Fold an answer in and re-read the rest of the scoresheet from there.
 *
 * The whole game is re-validated rather than patched from the answer onward.
 * Re-validating is cheap, and patching would mean maintaining a second, subtly
 * different notion of how a scoresheet is read.
 */
export function applyAnswer(
  rawMoves: RawMovePair[],
  confirmed: ConfirmedMoves,
  key: string,
  san: string,
): { confirmed: ConfirmedMoves; moves: ValidatedMove[] } {
  const next = { ...confirmed, [key]: san }
  return { confirmed: next, moves: validateGame(rawMoves, next) }
}

/** Half-moves still unresolved — what a teacher is asked to look at. */
export function unresolved(moves: ValidatedMove[]): ValidatedMove[] {
  return moves.filter(isUncertain)
}

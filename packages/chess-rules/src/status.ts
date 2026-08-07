/**
 * Move status, and the handful of predicates over it.
 *
 * Deliberately its own module, importing nothing. Everything else here pulls
 * in chess.js, and the kiosk needs to ask "is anything uncertain?" — to decide
 * whether to interrupt a student at all — without shipping a chess engine to
 * every child who submitted a worksheet.
 */

/**
 * How a move was resolved, in descending order of confidence.
 *
 * `confirmed` outranks everything: a student looked at the board and said which
 * move they played. It is kept distinct from `ok` rather than folded into it,
 * because "the machine read this cleanly" and "a child told us" are different
 * claims and a teacher is entitled to tell them apart.
 *
 * `missing` and `failed` are different failures: `missing` is an empty cell the
 * board could not fill in, `failed` is text that could not be made into any
 * legal move. Both are for a human; only one is the child's fault.
 */
export type MoveStatus =
  | 'confirmed'
  | 'ok'
  | 'normalized'
  | 'corrected'
  | 'inferred'
  | 'missing'
  | 'failed'

export interface RawMovePair {
  n: number
  w?: string | null
  b?: string | null
}

export interface ValidatedMove {
  n: number
  side: 'white' | 'black'
  /** Exactly what the child wrote. Never rewritten. */
  raw: string | null
  /** The resolved move in standard algebraic notation, or null if unresolved. */
  san: string | null
  uci: string | null
  status: MoveStatus
}

/**
 * Statuses that need no human. Everything else is a candidate for a prompt.
 *
 * `inferred` is settled because it means only one move was legal — the board
 * proved it, there is nothing to ask. `missing` is *not* asked about either,
 * for a different reason: the cell is blank, so there is no handwriting to
 * interpret and the student has nothing to recognise.
 */
const SETTLED: ReadonlySet<MoveStatus> = new Set<MoveStatus>([
  'confirmed',
  'ok',
  'normalized',
  'inferred',
])

/** The moves worth stopping on: there is text, and we are not sure of it. */
export function isUncertain(move: ValidatedMove): boolean {
  return !SETTLED.has(move.status) && move.raw !== null
}

/** Stable identifier for one half-move: `"3-white"`. */
export function moveKey(n: number, side: 'white' | 'black'): string {
  return `${n}-${side}`
}

/**
 * Half-moves a human has settled, keyed by `moveKey`, valued by SAN.
 *
 * This is the re-anchoring input (BHCS-11). A confirmed move is played as
 * given, and every move after it is then resolved against the position that
 * produces — which is the entire point: one answer near the start of a
 * scoresheet can rescue the whole tail behind it.
 */
export type ConfirmedMoves = Record<string, string>

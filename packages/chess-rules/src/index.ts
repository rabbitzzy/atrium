/**
 * @atrium/chess-rules — turning what a child wrote into moves that exist.
 *
 * A helper in the sense of impl/architecture.md: pure logic, no I/O, no
 * network, no env vars, no React. That purity is the whole reason it is a
 * package. The same code has to run in the capture function (BHCS-12, this
 * ticket) and in the browser (BHCS-11, re-anchoring the board as a student
 * confirms each uncertain move). A service would run in neither without a
 * network round trip per confirmation.
 *
 * Ported from `~/src/chess-karma` — `parser.py` and `validator.py`, about 340
 * lines of working Python, onto chess.js.
 */

export { normalizeRaw, generateCandidates } from './normalize'
export { sequenceRatio, sanSimilarity } from './similarity'
export { parseSan, bestLegalMove, validateGame } from './validate'
// From './status' rather than './validate': these carry no chess.js with them,
// so a bundle that only needs to ask "is anything uncertain?" stays small.
export { isUncertain, moveKey } from './status'
export type { MoveStatus, RawMovePair, ValidatedMove, ConfirmedMoves } from './status'
export { nextPrompt, optionsFor, positionBefore, applyAnswer, unresolved } from './resolve'
export type { ResolutionPrompt, MoveOption } from './resolve'
// Reading a sheet that is still arriving (BHCS-17).
export { LOOKAHEAD, stablePrefix, promptWhileStreaming } from './stream'
export type { ArrivingMove } from './stream'
// Reading a board that was drawn rather than played (BHCS-106).
export { toPosition, toPositions } from './fen'
export type { BoardPosition, PieceColor, RawBoard, RawPiece } from './fen'

import { validateGame } from './validate'
import { toPositions, type BoardPosition, type RawBoard } from './fen'
import type { ConfirmedMoves, MoveStatus, RawMovePair, ValidatedMove } from './status'

/**
 * The shape the chess capture prompt produces — chess-karma's OCR contract,
 * plus the diagrams BHCS-106 added.
 *
 * `moves` and `boards` are independent and either may be empty: a page can be
 * a scoresheet, a sheet of puzzle positions, or a scoresheet with the final
 * position drawn under it. `boards` is optional rather than required because
 * every chess capture taken before BHCS-106 is stored without it.
 */
export interface ChessScoresheet {
  metadata: {
    white: string | null
    black: string | null
    date: string | null
    round?: string | null
    board?: string | null
    result: string | null
  }
  moves: RawMovePair[]
  boards?: RawBoard[]
}

export type MoveCounts = Record<MoveStatus, number>

/**
 * The validated scoresheet.
 *
 * Carries `metadata` through because this object is what the kiosk renders,
 * and a game still has to say who played whom.
 *
 * It also carries `source` — the raw move grid it was built from. That is a
 * duplicate of `ocr_json` and it is deliberate: re-validating after a student
 * confirms a move needs the original handwriting, and the alternative is
 * handing the resolution step a second input it would have to keep in step.
 * `ocr_json` remains the authoritative untouched record; this is a working
 * copy, and nothing writes back to it.
 */
export interface ValidatedScoresheet {
  metadata: ChessScoresheet['metadata']
  source: RawMovePair[]
  moves: ValidatedMove[]
  /**
   * Diagrams on the page, notated. Empty for a plain scoresheet, and empty for
   * every capture taken before BHCS-106.
   *
   * Deliberately outside `confidence`: a position either notated or it did
   * not, and averaging that with how well the handwriting read would make one
   * number that answers neither question.
   */
  boards: BoardPosition[]
  /** Answers a student gave, keyed by `moveKey`. Empty until they are asked. */
  confirmed: ConfirmedMoves
  counts: MoveCounts
  /**
   * Half-moves the machine read without repair, plus any a student settled,
   * over half-moves that resolved at all. The number to put in front of a
   * teacher; 1 means the scoresheet is fully accounted for.
   */
  confidence: number
}

const ZERO_COUNTS: MoveCounts = {
  confirmed: 0,
  ok: 0,
  normalized: 0,
  corrected: 0,
  inferred: 0,
  missing: 0,
  failed: 0,
}

export function countByStatus(moves: ValidatedMove[]): MoveCounts {
  const counts = { ...ZERO_COUNTS }
  for (const m of moves) counts[m.status]++
  return counts
}

/** Validate a scoresheet as extracted, leaving the extraction untouched. */
export function validateScoresheet(
  ocr: ChessScoresheet,
  confirmed: ConfirmedMoves = {},
): ValidatedScoresheet {
  const source = ocr.moves ?? []
  const moves = validateGame(source, confirmed)
  const counts = countByStatus(moves)
  const resolved =
    counts.confirmed + counts.ok + counts.normalized + counts.corrected + counts.inferred

  return {
    metadata: ocr.metadata,
    source,
    moves,
    boards: toPositions(ocr.boards),
    confirmed,
    counts,
    confidence: resolved > 0 ? (counts.confirmed + counts.ok) / resolved : 0,
  }
}

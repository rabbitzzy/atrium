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
export type { MoveStatus, RawMovePair, ValidatedMove } from './validate'

import { validateGame, type MoveStatus, type RawMovePair, type ValidatedMove } from './validate'

/** The shape the chess capture prompt produces — chess-karma's OCR contract. */
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
}

export type MoveCounts = Record<MoveStatus, number>

/**
 * The validated scoresheet.
 *
 * Carries `metadata` through because this object is what the kiosk renders,
 * and a game still has to say who played whom. It never carries the raw move
 * grid: that stays in `ocr_json`, untouched, as the teacher's audit trail —
 * and each move keeps its own `raw` here anyway, so nothing is lost by looking
 * at only one of the two.
 */
export interface ValidatedScoresheet {
  metadata: ChessScoresheet['metadata']
  moves: ValidatedMove[]
  counts: MoveCounts
  /**
   * Half-moves resolved without any repair, over half-moves that resolved at
   * all. The number to put in front of a teacher; 1 means the scoresheet read
   * cleanly end to end.
   */
  confidence: number
}

const ZERO_COUNTS: MoveCounts = {
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
export function validateScoresheet(ocr: ChessScoresheet): ValidatedScoresheet {
  const moves = validateGame(ocr.moves ?? [])
  const counts = countByStatus(moves)
  const resolved = counts.ok + counts.normalized + counts.corrected + counts.inferred
  return {
    metadata: ocr.metadata,
    moves,
    counts,
    confidence: resolved > 0 ? counts.ok / resolved : 0,
  }
}

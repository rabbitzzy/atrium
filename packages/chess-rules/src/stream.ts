/**
 * Reading a scoresheet that is still arriving (BHCS-17).
 *
 * The point of streaming chess is not to watch moves appear — a move table is
 * not read the way feedback prose is read. It is that the *question* BHCS-11
 * stops to ask sits at half-move 8 of 80, median, so it can be asked while the
 * rest of the sheet is still being transcribed behind the student.
 *
 * Two rules stand between "moves are arriving" and "this question is safe to
 * ask", and both are here rather than in the app because both are chess:
 *
 *  - **A pair is only readable once both cells have closed.** A row that has
 *    arrived as `{n: 8, w: "bf4"}` is not a row where Black played nothing; it
 *    is a row whose Black cell has not been written yet. Treating the first as
 *    the second desynchronises the board from that point on — the exact
 *    failure the resolution step exists to repair.
 *  - **A half-move cannot be judged until four more follow it.**
 *    `bestLegalMove` breaks ties by looking ahead, so asking about half-move N
 *    the instant it lands means asking from a reading that the next four cells
 *    could still overturn.
 *
 * Everything here is pure, like the rest of this package. It runs in the
 * browser against a growing array with no notion of where that array came from.
 */

import { validateGame } from './validate'
import { nextPrompt, type ResolutionPrompt } from './resolve'
import type { ConfirmedMoves, RawMovePair } from './status'

/**
 * How far `bestLegalMove` looks ahead when a cell is ambiguous, and therefore
 * how far behind the arriving edge a reading has to stay to be trustworthy.
 *
 * Small and bounded: four half-moves is ~5% of a full sheet.
 */
export const LOOKAHEAD = 4

/**
 * A row part-way through arriving: a `RawMovePair` that may not have all of
 * itself yet, including its move number.
 *
 * `RawMovePair` already makes the two cells optional — for a row a child left
 * blank — so the only thing added here is that `n` can be missing too, which
 * is what a row that has merely *opened* looks like.
 */
export type ArrivingMove = Partial<RawMovePair>

/**
 * The rows that have finished arriving.
 *
 * A row counts as finished when both cells are *present* — `null` included,
 * which is a genuinely blank cell — rather than merely truthy. That
 * distinction is the whole function: absent means "not yet", null means
 * "nothing was written there", and only the schema's `required` guarantee that
 * both keys appear together makes the two separable at all.
 */
export function stablePrefix(arriving: readonly ArrivingMove[]): RawMovePair[] {
  const settled: RawMovePair[] = []
  for (const move of arriving) {
    if (typeof move?.n !== 'number' || !('w' in move) || !('b' in move)) break
    settled.push({ n: move.n, w: move.w ?? null, b: move.b ?? null })
  }
  return settled
}

/**
 * The question to ask now, if asking now is safe.
 *
 * Null means "not yet" and never "nothing to ask" — a stream that has not
 * reached the anchor for its first uncertain move is indistinguishable, from
 * here, from a clean scoresheet. Only the finished sheet can say there is
 * nothing to ask, which is why the buffered `nextPrompt` remains what decides
 * that at the end.
 */
export function promptWhileStreaming(
  arriving: readonly ArrivingMove[],
  confirmed: ConfirmedMoves = {},
): ResolutionPrompt | null {
  const settled = stablePrefix(arriving)
  if (settled.length === 0) return null

  const moves = validateGame(settled, confirmed)
  const prompt = nextPrompt(moves)
  if (!prompt) return null

  // The four half-moves after this one must already be in hand, or the reading
  // being asked about is still provisional.
  return prompt.index + LOOKAHEAD < moves.length ? prompt : null
}

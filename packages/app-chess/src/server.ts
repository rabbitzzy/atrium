/**
 * Chess notes — server half.
 *
 * Two stages, and the split between them is the point. The prompt extracts
 * what the child wrote, verbatim and uncorrected. `refine` then decides what
 * it meant, against the board. Neither stage is allowed to do the other's job:
 * a prompt that quietly corrects notation destroys the evidence the validator
 * reasons from, and a validator that rewrites `ocr_json` destroys the evidence
 * a teacher reasons from.
 */

import type { CaptureAppServer, GeminiSchema } from '@atrium/schema'
import { validateScoresheet, type ChessScoresheet, type ValidatedScoresheet } from '@atrium/chess-rules'

const CHESS_SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    metadata: {
      type: 'OBJECT',
      properties: {
        white: { type: 'STRING', nullable: true },
        black: { type: 'STRING', nullable: true },
        date: { type: 'STRING', nullable: true },
        round: { type: 'STRING', nullable: true },
        board: { type: 'STRING', nullable: true },
        result: { type: 'STRING', nullable: true },
      },
      required: ['white', 'black', 'date', 'round', 'board', 'result'],
      propertyOrdering: ['white', 'black', 'date', 'round', 'board', 'result'],
    },
    moves: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          n: { type: 'INTEGER', description: 'Move number printed on the sheet' },
          w: { type: 'STRING', nullable: true, description: "White's move, verbatim" },
          b: { type: 'STRING', nullable: true, description: "Black's move, verbatim" },
        },
        required: ['n', 'w', 'b'],
        propertyOrdering: ['n', 'w', 'b'],
      },
    },
  },
  required: ['metadata', 'moves'],
  propertyOrdering: ['metadata', 'moves'],
}

// Ported from chess-karma/prompts/scoresheet.txt. The verbatim-preservation
// rules read as heavy-handed, but they are load-bearing and stay as written:
// models autocorrect chess notation by reflex, and this pipeline's entire value
// is capturing what the child actually wrote so the downstream corrector can
// reason about the error. Softening these produces silently "clean" output.
const CHESS_PROMPT = `You are extracting chess moves from a handwritten scoresheet image.

The scoresheet has two panels:
- LEFT panel: move numbers 1 through 20 (approximately), each row has a move number, a WHITE move, and a BLACK move
- RIGHT panel: move numbers 21 onward, same layout

CRITICAL RULES:
1. Extract VERBATIM what is handwritten — do NOT correct spelling, do NOT normalize notation
2. Use the row number printed on the sheet as the authoritative move number (n)
3. If a cell is blank or clearly missing, use null
4. For castling written as 0-0 or 0-0-0, preserve it exactly as written
5. Preserve any check (+) or checkmate (#) symbols if written
6. Include capture (x) exactly as written — do NOT add or remove it
7. Preserve the exact case the child wrote (e.g., "bc4" not "Bc4", "NVH6" not "Nh6")
8. Preserve stray or unclear characters — do not clean them up

Extract the metadata and all moves in order from move 1 to the last written move.`

export const chessServer: CaptureAppServer<ChessScoresheet, ValidatedScoresheet> = {
  id: 'chess',

  extract: {
    schema: CHESS_SCHEMA,
    systemPrompt: CHESS_PROMPT,
    userPrompt: 'Extract all chess moves and metadata from this scoresheet.',
  },

  /**
   * Resolve the transcription against the rules of chess.
   *
   * Pure and synchronous under the hood — no model call, no network, no cost.
   * It runs on the extraction that is already in hand, which is also why the
   * backfill can replay it over every chess capture ever taken.
   */
  async refine(raw) {
    return validateScoresheet(raw)
  },
}

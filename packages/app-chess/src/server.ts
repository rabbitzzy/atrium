/**
 * Chess notes — server half.
 *
 * Two stages, and the split between them is the point. The prompt extracts
 * what the child wrote, verbatim and uncorrected. `refine` then decides what
 * it meant, against the board. Neither stage is allowed to do the other's job:
 * a prompt that quietly corrects notation destroys the evidence the validator
 * reasons from, and a validator that rewrites `ocr_json` destroys the evidence
 * a teacher reasons from.
 *
 * A page of chess can be two different artifacts, and BHCS-106 made the second
 * one first-class: a **scoresheet** is a game someone played and wrote down,
 * a **diagram** is a position someone drew. Both are extracted in one pass,
 * both may be empty, and the same division of labour holds for each — the
 * model says which piece is on which square, and `refine` turns that into the
 * FEN, because run-length-encoding empty squares is arithmetic and arithmetic
 * is not what a model looking at a picture is good at.
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
      description: 'The written move list. Empty if the page has no scoresheet on it.',
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
    boards: {
      type: 'ARRAY',
      description:
        'Board diagrams on the page, in reading order. Empty if there are none.',
      items: {
        type: 'OBJECT',
        properties: {
          label: {
            type: 'STRING',
            nullable: true,
            description: 'Caption or number printed beside the diagram, e.g. "Puzzle 3"',
          },
          orientation: {
            type: 'STRING',
            nullable: true,
            description: '"white" or "black" — which side is drawn at the bottom edge',
          },
          sideToMove: {
            type: 'STRING',
            nullable: true,
            description: '"white" or "black" if the diagram says who is to play, else null',
          },
          // A list of pieces, never a FEN: see the note at the top of the file.
          pieces: {
            type: 'ARRAY',
            description: 'One entry per piece standing on the board. Empty squares are not listed.',
            items: {
              type: 'OBJECT',
              properties: {
                square: {
                  type: 'STRING',
                  description: 'The square in algebraic coordinates: file a-h then rank 1-8, e.g. "e4"',
                },
                color: { type: 'STRING', enum: ['white', 'black'] },
                piece: {
                  type: 'STRING',
                  enum: ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'],
                },
              },
              required: ['square', 'color', 'piece'],
              propertyOrdering: ['square', 'color', 'piece'],
            },
          },
        },
        required: ['label', 'orientation', 'sideToMove', 'pieces'],
        propertyOrdering: ['label', 'orientation', 'sideToMove', 'pieces'],
      },
    },
  },
  required: ['metadata', 'moves', 'boards'],
  propertyOrdering: ['metadata', 'moves', 'boards'],
}

// Ported from chess-karma/prompts/scoresheet.txt, with BHCS-106's diagram half
// added below it. The verbatim-preservation rules read as heavy-handed, but
// they are load-bearing and stay as written: models autocorrect chess notation
// by reflex, and this pipeline's entire value is capturing what the child
// actually wrote so the downstream corrector can reason about the error.
// Softening these produces silently "clean" output.
const CHESS_PROMPT = `You are reading a page of chess work from a photograph.

A page can carry either or both of two things, and they are unrelated:
- a SCORESHEET: a numbered list of moves, someone's record of a game they played
- one or more BOARD DIAGRAMS: a drawn or printed 8x8 board with pieces on it

Report whichever are there. If the page has no scoresheet, return an empty
moves list. If it has no diagram, return an empty boards list. Never invent
either one.

## SCORESHEET

The scoresheet usually has two panels:
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

Extract the metadata and all moves in order from move 1 to the last written move.

## BOARD DIAGRAMS

A diagram is a square grid of 64 alternating light and dark squares with chess
pieces standing on it. A grid of ruled boxes containing handwriting is a
scoresheet, not a board — do not report it as one.

For each diagram on the page:
1. List every piece you can see, one entry each: its square, its colour, and
   what it is. Do not list empty squares, and do not write a FEN — the square
   names are all that is wanted.
2. Name squares in the standard way: file letter a-h, then rank number 1-8.
   So "e4", "g7", "a1".
3. Use the coordinate letters and numbers printed along the edges of the board
   if there are any. They are the authority on which square is which.
4. If the board has no printed coordinates, assume White is at the bottom:
   rank 1 is the bottom row, rank 8 is the top row, file a is the left column.
5. If the diagram is drawn from Black's side — black pieces along the bottom,
   or edge labels running h to a from the left — then say orientation "black",
   and STILL report the true squares. A black rook in the bottom-left corner of
   a board drawn from Black's side is on h8, not a1.
6. Set sideToMove only if the diagram actually says ("White to move", "Black to
   play", "白先", "黑方走"). Otherwise leave it null.
7. Put the diagram's caption or number in label — "Puzzle 3", "Position after
   12...Nf6", "第二题". Null if it has none.
8. If there are several diagrams, report each of them separately, in reading
   order: left to right, then top to bottom.

HOW TO READ A DIAGRAM ACCURATELY:
Work one rank at a time, from the top row down. For each rank, go across all
eight squares in order — a, b, c, d, e, f, g, h — and say which of them are
empty and which hold a piece, before writing anything down.

Naming the file is where this goes wrong. A piece recorded one column to the
left or right produces a position that still looks completely plausible, so
there is nothing later to catch it. For every piece, follow its column
straight down to the letter printed at the bottom edge of that board, and
follow its row straight across to the number at the side. Use those two
labels. Do not estimate the square from the piece's position on the page.

Read the pieces carefully too. A knight and a bishop are easy to confuse in a
hand-drawn diagram, and so are a queen and a king — look at the crown before
deciding. A white piece is usually drawn hollow or in outline and a black one
filled in solid; the colour of the SQUARE it stands on means nothing. If a
piece is genuinely unreadable, leave it out rather than guessing.`

export const chessServer: CaptureAppServer<ChessScoresheet, ValidatedScoresheet> = {
  id: 'chess',

  extract: {
    schema: CHESS_SCHEMA,
    systemPrompt: CHESS_PROMPT,
    userPrompt:
      'Read this page of chess: any moves written on it, and any board diagrams drawn on it.',
  },

  /**
   * Resolve the transcription against the rules of chess, and notate every
   * diagram the page carried.
   *
   * Pure and synchronous under the hood — no model call, no network, no cost.
   * It runs on the extraction that is already in hand, which is also why the
   * backfill can replay it over every chess capture ever taken. Captures taken
   * before BHCS-106 simply have no `boards` to notate and replay to an empty
   * list.
   */
  async refine(raw) {
    return validateScoresheet(raw)
  },
}

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

import type { CaptureAppServer, CloseUpRegion, GeminiSchema } from '@atrium/schema'
import {
  validateScoresheet,
  type ChessScoresheet,
  type RawPiece,
  type ValidatedScoresheet,
} from '@atrium/chess-rules'

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
          box: {
            type: 'ARRAY',
            description:
              'Where this board is on the page, as [ymin, xmin, ymax, xmax], each between 0 and 1000, measured on the whole image. The board grid itself — the outer edge of the 64 squares — not the caption and not the coordinate letters beside it.',
            items: { type: 'INTEGER' },
          },
        },
        required: ['label', 'orientation', 'sideToMove', 'box'],
        propertyOrdering: ['label', 'orientation', 'sideToMove', 'box'],
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

**Do not read the pieces.** Each board will be looked at again, close up, on
its own. Your job here is to find the boards and to read what is printed
around them, which is the part that will not be visible close up.

For each diagram on the page:
1. Give its box: where the board grid sits on the page, as [ymin, xmin, ymax,
   xmax] with every value between 0 and 1000, measured on the whole image. Bound
   the 64 squares themselves — not the caption underneath, not the coordinate
   letters and numbers along the edges, and never two boards in one box.
2. Put the diagram's caption or number in label — "Puzzle 3", "1. White to
   play", "第二题". Null if it has none.
3. Set sideToMove if the caption says who is to play ("White to move", "Black
   to play", "白先", "黑方走"). Otherwise leave it null.
4. Say which way round the board is drawn. Look at the coordinate letters along
   the bottom edge: a,b,c,...,h from the left is a board drawn from White's
   side — orientation "white". h,g,f,...,a from the left is drawn from Black's
   side — orientation "black". If there are no coordinates at all, say "white".
5. Go in reading order: left to right, then top to bottom.`

/**
 * Reading one board, alone, out of a crop of the page (BHCS-107).
 *
 * The rank-by-rank instruction is not padding. Measured against a rendered
 * page, telling the model to work a rank at a time and to name each square
 * from the printed edge labels was what turned a board it read a file off into
 * one it read exactly right, repeatably and at two image scales. Two narrower
 * hints were tried and made it worse — a warning about the outside files
 * pushed pieces toward the edges, and asking for eight rows of eight cells
 * scored worse than a plain list of pieces.
 */
const BOARD_PROMPT = `You are looking at one chess board diagram, cropped from a
page of them. Read the position on it.

The board in front of you fills most of the picture. A sliver of a neighbouring
diagram, or a stray coordinate letter belonging to one, may be visible at the
very edge — ignore anything that is not part of the board that fills the frame.

1. List every piece you can see, one entry each: its square, its colour, and
   what it is. Do not list empty squares, and do not write a FEN — the square
   names are all that is wanted.
2. Name squares in the standard way: file letter a-h, then rank number 1-8.
   So "e4", "g7", "a1".
3. Use the coordinate letters and numbers printed along the edges of THIS board
   if it has any. They are the authority on which square is which.
4. If it has no coordinates, White is at the bottom unless you are told
   otherwise: rank 1 is the bottom row, rank 8 the top, file a the left column.
5. If you are told the board is drawn from Black's side, the bottom-left corner
   is h1 and the top-right is a8. Report the true squares either way.

HOW TO READ IT ACCURATELY:
Work one rank at a time, from the top row down. For each rank, go across all
eight squares in order — a, b, c, d, e, f, g, h — and say which of them are
empty and which hold a piece, before writing anything down.

Naming the file is where this goes wrong. A piece recorded one column to the
left or right produces a position that still looks completely plausible, so
there is nothing later to catch it. For every piece, follow its column
straight down to the letter printed at the bottom edge of the board, and
follow its row straight across to the number at the side. Use those two
labels. Do not estimate the square from the piece's position on the picture.

Read the pieces carefully too. A knight and a bishop are easy to confuse in a
hand-drawn diagram, and so are a queen and a king — look at the crown before
deciding. A white piece is usually drawn hollow or in outline and a black one
filled in solid; the colour of the SQUARE it stands on means nothing.

These sheets are worked on. A child may have drawn an arrow across the board,
circled a square, or written the answer over it. Pen marks are not pieces, and
a piece with an arrow drawn through it is still on the square it is standing
on. If a piece is genuinely hidden or unreadable, leave it out rather than
guessing.`

/**
 * The model that locates the diagrams. Named here rather than in the platform
 * because it is this pass's requirement, not the station's.
 */
const LOCATE_MODEL = 'gemini-3.8-flash'

const BOARD_SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
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
  required: ['pieces'],
}

/** What one close-up call comes back with. */
interface BoardReading {
  pieces?: RawPiece[]
}

/**
 * Gemini reports boxes as [ymin, xmin, ymax, xmax] on a 0-1000 scale. The
 * platform wants fractions of the image, which is the same thing said in the
 * units a cropper can use without knowing how big the photograph was.
 */
export function toBox(raw: unknown): Box | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null
  const [ymin, xmin, ymax, xmax] = raw.map(Number)
  if (![ymin, xmin, ymax, xmax].every(Number.isFinite)) return null

  const top = Math.min(ymin!, ymax!) / 1000
  const bottom = Math.max(ymin!, ymax!) / 1000
  const left = Math.min(xmin!, xmax!) / 1000
  const right = Math.max(xmin!, xmax!) / 1000
  if (bottom - top <= 0 || right - left <= 0) return null

  return { left, top, right, bottom }
}

type Box = CloseUpRegion['box']

/**
 * How far outside its box a board's crop reaches.
 *
 * A box drawn tight to the grid and then a few units short loses the outer
 * rank of pieces, and that failure is silent: the position comes back a rook
 * lighter and perfectly legal. It happens for an ordinary reason — a sheet of
 * paper under a camera is never quite square to it, so the top-left corner of
 * a board sits higher than the top-right and no axis-aligned box contains both
 * without slack. Measured on the first real capture, a tight box cut the whole
 * of rank 8 off puzzle 1.
 */
const PAD = 0.08

/**
 * Widen a box, but never into the board next door (BHCS-107).
 *
 * Nine puzzles on a sheet sit in a grid with a few millimetres between them,
 * so padding a box by enough to survive the tilt is also enough to pull in a
 * slice of the neighbour — and a crop showing two boards is how a rook from
 * one ends up in the other's position. The vertical gaps on a page like that
 * are generous and the horizontal ones are not, which is why this is a clip
 * against the actual neighbours rather than a smaller pad: each edge gets all
 * the room there is, and no more.
 */
export function padBox(box: Box, others: Box[]): Box {
  const width = box.right - box.left
  const height = box.bottom - box.top

  let left = box.left - width * PAD
  let top = box.top - height * PAD
  let right = box.right + width * PAD
  let bottom = box.bottom + height * PAD

  for (const other of others) {
    if (other === box) continue
    // Only a board on the same row can limit a horizontal edge, and only one
    // in the same column can limit a vertical one. A board on the diagonal is
    // not in the way of either.
    const sameRow = other.top < box.bottom && other.bottom > box.top
    const sameColumn = other.left < box.right && other.right > box.left

    if (sameRow && other.left >= box.right) right = Math.min(right, other.left)
    if (sameRow && other.right <= box.left) left = Math.max(left, other.right)
    if (sameColumn && other.top >= box.bottom) bottom = Math.min(bottom, other.top)
    if (sameColumn && other.bottom <= box.top) top = Math.max(top, other.bottom)
  }

  return { left, top, right, bottom }
}

/** What the close-up is told about the board it is looking at. */
function noteFor(board: { label?: string | null; orientation?: string | null }): string {
  const which = board.label ? `This is the diagram captioned "${board.label}".` : ''
  const side =
    (board.orientation ?? '').trim().toLowerCase().startsWith('b')
      ? 'It is drawn from Black\'s side: the bottom-left corner is h1.'
      : 'It is drawn from White\'s side: the bottom-left corner is a1.'
  return `${which} ${side}`.trim()
}

export const chessServer: CaptureAppServer<ChessScoresheet, ValidatedScoresheet> = {
  id: 'chess',

  extract: {
    schema: CHESS_SCHEMA,
    systemPrompt: CHESS_PROMPT,

    /**
     * The page pass needs a model that can ground (BHCS-107).
     *
     * This is the one place in the app that names a model, and it is not a
     * preference. Asked to locate the nine diagrams on the first real capture,
     * `gemini-2.5-flash` returned nine boxes of identical width, evenly
     * spaced — a grid it assumed rather than measured, and one that cropped
     * half a board at a time. Telling it in the prompt that the page is skewed
     * and the boxes will not be regular changed nothing. `gemini-3.5-flash`
     * and this model both return boxes whose left edges track the actual lean
     * of the paper down the page, in about the same ten seconds.
     *
     * The close-up reads stay on the station's model: reading one board that
     * fills the frame is a job the default does well and faster.
     */
    model: LOCATE_MODEL,
    userPrompt:
      'Read the moves written on this page, and find every board diagram drawn on it.',

    /**
     * Then look at each board on its own (BHCS-107).
     *
     * One call per diagram, which on a nine-puzzle sheet is nine calls — the
     * price of the difference between nine positions and one position
     * repeated nine times.
     */
    closeUp: {
      schema: BOARD_SCHEMA,
      systemPrompt: BOARD_PROMPT,
      userPrompt: 'Read the position on this chess board.',

      regions(raw) {
        const boards = raw.boards ?? []
        // Every box on the page, so each crop can be widened up to its
        // neighbours and no further.
        const boxes = boards.map((b) => toBox(b.box)).filter((b): b is Box => b !== null)

        const regions: CloseUpRegion[] = []
        for (const board of boards) {
          const box = toBox(board.box)
          // A board the page pass could not place cannot be cropped. It stays
          // in the extraction, with no pieces, and says so in the result.
          if (box) regions.push({ box: padBox(box, boxes), note: noteFor(board) })
        }
        return regions
      },

      merge(raw, readings) {
        const boards = raw.boards ?? []
        let next = 0
        return {
          ...raw,
          boards: boards.map((board) => {
            if (!toBox(board.box)) return { ...board, pieces: [] }
            const reading = readings[next++] as BoardReading | null
            return { ...board, pieces: reading?.pieces ?? [] }
          }),
        }
      },
    },
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

/**
 * A drawn board becomes a position the rest of the chess world can read
 * (BHCS-106).
 *
 * Pure, like everything else here: it runs in the capture function today and
 * would run unchanged in the browser tomorrow.
 *
 * ── Why the model is never asked for a FEN ──────────────────────────────────
 *
 * FEN packs empty squares into run-lengths — `r1bqkbnr/pppp1ppp/8/…` — and the
 * ranks must sum to exactly eight. That arithmetic is where a model reading a
 * picture goes wrong, and it goes wrong *silently*: an off-by-one in rank 5
 * shifts every piece on it a file to the left and still parses. So the
 * extraction asks for the one thing a reader of a picture is actually good at
 * — which piece is on which named square — and the counting happens here,
 * where it is arithmetic rather than perception.
 */

import { validateFen } from 'chess.js'

export type PieceColor = 'white' | 'black'

/** One piece as the extraction reports it: a named square, a colour, a kind. */
export interface RawPiece {
  square: string
  color: string
  piece: string
}

/** One diagram as the extraction reports it. */
export interface RawBoard {
  /** The caption printed beside it — "Puzzle 3", "第二题". */
  label?: string | null
  /** Which side is drawn at the bottom. Presentation only; FEN is absolute. */
  orientation?: string | null
  sideToMove?: string | null
  pieces?: RawPiece[]
}

/** One diagram, notated. */
export interface BoardPosition {
  label: string | null
  orientation: PieceColor
  /**
   * Always present, even when `legal` is false. See `problems`.
   */
  fen: string
  /** How many pieces actually made it onto the board. */
  pieces: number
  /**
   * Whether chess.js accepts this as a position a game could be in.
   *
   * Not the same question as "is this a real diagram". A mate-in-two with the
   * black king missing is a transcription error; a king-and-pawn endgame with
   * the black king missing is a teaching position someone drew on purpose.
   * The code cannot tell those apart, so it reports and does not judge.
   */
  legal: boolean
  /** Everything that went wrong or looked odd, in a child's page's terms. */
  problems: string[]
  /** Opens the position on lichess — the analysis board, or the editor. */
  lichess: string
  /** Opens the position on chess.com's analysis board. */
  chessCom: string
}

const SQUARE = /^[a-h][1-8]$/

/**
 * Both spellings the model produces: the word, and the FEN letter.
 *
 * Spelled out rather than taken from the first character, because chess has
 * one piece where that fails and it is not a rare one: a knight is `n`, and
 * `k` is the king. A first-character rule turns every knight on the page into
 * a second king, and the resulting FEN is still perfectly well-formed — it is
 * just a different position. This table is the fix and the test below is the
 * reason it exists.
 */
const PIECE_LETTER: Record<string, string> = {
  king: 'k',
  queen: 'q',
  rook: 'r',
  bishop: 'b',
  knight: 'n',
  pawn: 'p',
  k: 'k',
  q: 'q',
  r: 'r',
  b: 'b',
  n: 'n',
  p: 'p',
}

function pieceLetter(piece: string | undefined | null): string | null {
  return PIECE_LETTER[(piece ?? '').trim().toLowerCase()] ?? null
}

/** `black`/`b` versus `white`/`w`. No default: a colour we cannot read is a
 * piece we decline to place, because placing it in the wrong colour produces a
 * plausible FEN of a position nobody drew. */
function colorOf(color: string | undefined | null): PieceColor | null {
  const first = (color ?? '').trim()[0]?.toLowerCase()
  return first === 'b' ? 'black' : first === 'w' ? 'white' : null
}

/** Rank 8 first, file a first — the order FEN wants to be written in. */
type Grid = (string | null)[][]

function emptyGrid(): Grid {
  return Array.from({ length: 8 }, () => Array<string | null>(8).fill(null))
}

function at(grid: Grid, square: string): string | null {
  return grid[8 - Number(square[1])]![square.charCodeAt(0) - 97] ?? null
}

/** The `rnbqkbnr/pppppppp/8/…` half: pieces, and runs of nothing. */
function placement(grid: Grid): string {
  return grid
    .map((rank) => {
      let out = ''
      let gap = 0
      for (const cell of rank) {
        if (cell === null) {
          gap++
          continue
        }
        if (gap > 0) {
          out += gap
          gap = 0
        }
        out += cell
      }
      return gap > 0 ? out + gap : out
    })
    .join('/')
}

/**
 * Castling rights, inferred from where the kings and rooks stand.
 *
 * A diagram almost never says. Lichess's own board editor makes the same
 * inference for the same reason: a king still on e1 with a rook still on h1 is
 * overwhelmingly a position where that castle is available, and the cost of
 * being wrong — one move missing from an analysis board — is far below the
 * cost of `-` on every position, which is a puzzle whose solution is castling
 * being declared unsolvable.
 */
function castling(grid: Grid): string {
  let rights = ''
  if (at(grid, 'e1') === 'K') {
    if (at(grid, 'h1') === 'R') rights += 'K'
    if (at(grid, 'a1') === 'R') rights += 'Q'
  }
  if (at(grid, 'e8') === 'k') {
    if (at(grid, 'h8') === 'r') rights += 'k'
    if (at(grid, 'a8') === 'r') rights += 'q'
  }
  return rights || '-'
}

/** Lichess takes a FEN in a path with its spaces as underscores. */
const asPath = (fen: string) => fen.replace(/ /g, '_')

/** Notate one diagram. Never throws: a bad board is a reported board. */
export function toPosition(board: RawBoard): BoardPosition {
  const problems: string[] = []
  const grid = emptyGrid()
  let placed = 0

  for (const raw of board.pieces ?? []) {
    const square = (raw?.square ?? '').trim().toLowerCase()
    const letter = pieceLetter(raw?.piece)
    const color = colorOf(raw?.color)

    if (!SQUARE.test(square)) {
      problems.push(`“${raw?.square ?? '?'}” is not a square on the board — that piece was left out`)
      continue
    }
    if (letter === null || color === null) {
      problems.push(`couldn’t tell what piece is on ${square} — it was left out`)
      continue
    }
    if (at(grid, square) !== null) {
      // Two pieces on one square is a misread, not a position. Keeping the
      // first is arbitrary; saying so is not.
      problems.push(`two pieces were read on ${square} — kept the first`)
      continue
    }

    grid[8 - Number(square[1])]![square.charCodeAt(0) - 97] =
      color === 'black' ? letter : letter.toUpperCase()
    placed++
  }

  if (placed === 0) problems.push('no pieces could be read on this board')

  const turn = colorOf(board.sideToMove) === 'black' ? 'b' : 'w'
  const fen = `${placement(grid)} ${turn} ${castling(grid)} - 0 1`

  // chess.js types `error` as optional even on the failing branch, so the
  // fallback is a type obligation rather than a real case — but it is also the
  // sentence a reader deserves if that ever changes.
  const check = validateFen(fen)
  if (!check.ok) {
    problems.push((check.error ?? 'this is not a position a game could reach').replace(/^Invalid FEN:\s*/, ''))
  }

  return {
    label: board.label?.trim() || null,
    orientation: colorOf(board.orientation) ?? 'white',
    fen,
    pieces: placed,
    legal: check.ok,
    problems,
    // An illegal position is exactly what the *editor* is for; the analysis
    // board would refuse it. Both are one click from the other on lichess.
    lichess: check.ok
      ? `https://lichess.org/analysis/standard/${asPath(fen)}`
      : `https://lichess.org/editor/${asPath(fen)}`,
    chessCom: `https://www.chess.com/analysis?fen=${encodeURIComponent(fen)}`,
  }
}

/** Notate every diagram on a page, in the order they were read. */
export function toPositions(boards: RawBoard[] | undefined | null): BoardPosition[] {
  return (boards ?? []).map(toPosition)
}

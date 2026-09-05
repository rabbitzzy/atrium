/**
 * Turning a drawn board into a FEN (BHCS-106).
 *
 * The claims worth testing are the ones the model is not doing: that runs of
 * empty squares come out right, that castling is inferred rather than guessed,
 * and that a position no game could reach still produces its notation.
 */

import { deepStrictEqual, match, ok, strictEqual } from 'node:assert/strict'
import { describe, test } from 'node:test'

import { toPosition, toPositions, type RawPiece } from './fen'

/** The opening position, described the way the extraction describes one. */
function startingPieces(): RawPiece[] {
  const back = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook']
  const files = 'abcdefgh'
  const pieces: RawPiece[] = []
  for (let i = 0; i < 8; i++) {
    pieces.push({ square: `${files[i]}1`, color: 'white', piece: back[i]! })
    pieces.push({ square: `${files[i]}2`, color: 'white', piece: 'pawn' })
    pieces.push({ square: `${files[i]}7`, color: 'black', piece: 'pawn' })
    pieces.push({ square: `${files[i]}8`, color: 'black', piece: back[i]! })
  }
  return pieces
}

describe('assembling the placement', () => {
  test('the opening position comes out as the FEN everyone knows', () => {
    const position = toPosition({ pieces: startingPieces() })
    strictEqual(position.fen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    strictEqual(position.legal, true)
    deepStrictEqual(position.problems, [])
    strictEqual(position.pieces, 32)
  })

  test('empty squares are counted, at the start, middle and end of a rank', () => {
    // Rank 8: two empty, a rook, four empty, a king → "2r4k".
    const position = toPosition({
      pieces: [
        { square: 'c8', color: 'black', piece: 'rook' },
        { square: 'h8', color: 'black', piece: 'king' },
        { square: 'a1', color: 'white', piece: 'king' },
      ],
    })
    strictEqual(position.fen.split(' ')[0], '2r4k/8/8/8/8/8/8/K7')
  })

  test('a FEN letter says the same thing as a word', () => {
    // `knight` → `n`, not `k`: the one piece whose word and letter disagree,
    // and the one that silently turns into a second king if this is done by
    // taking first characters.
    const LETTER: Record<string, string> = {
      king: 'k',
      queen: 'q',
      rook: 'r',
      bishop: 'b',
      knight: 'n',
      pawn: 'p',
    }
    const words = toPosition({ pieces: startingPieces() })
    const letters = toPosition({
      pieces: startingPieces().map((p) => ({
        ...p,
        piece: LETTER[p.piece]!,
        color: p.color[0]!,
      })),
    })
    strictEqual(letters.fen, words.fen)
    ok(words.fen.startsWith('rnbqkbnr'), words.fen)
  })
})

describe('the fields a diagram does not print', () => {
  test('side to move follows the caption, and defaults to White', () => {
    const pieces = startingPieces()
    strictEqual(toPosition({ pieces, sideToMove: 'black' }).fen.split(' ')[1], 'b')
    strictEqual(toPosition({ pieces, sideToMove: 'Black to play' }).fen.split(' ')[1], 'b')
    strictEqual(toPosition({ pieces }).fen.split(' ')[1], 'w')
  })

  test('castling is inferred from where the kings and rooks stand', () => {
    const rights = (pieces: RawPiece[]) => toPosition({ pieces }).fen.split(' ')[2]

    strictEqual(rights(startingPieces()), 'KQkq')
    // White's h-rook has moved; the black king has not.
    strictEqual(rights(startingPieces().filter((p) => p.square !== 'h1')), 'Qkq')
    // Kings off their home squares — a middlegame diagram — claims nothing.
    strictEqual(
      rights([
        { square: 'g1', color: 'white', piece: 'king' },
        { square: 'f1', color: 'white', piece: 'rook' },
        { square: 'g8', color: 'black', piece: 'king' },
        { square: 'f8', color: 'black', piece: 'rook' },
      ]),
      '-',
    )
  })

  test('orientation is recorded but never changes the squares', () => {
    const drawn = { pieces: startingPieces(), orientation: 'black' }
    strictEqual(toPosition(drawn).orientation, 'black')
    strictEqual(toPosition(drawn).fen, toPosition({ ...drawn, orientation: 'white' }).fen)
  })
})

describe('a board that did not read cleanly', () => {
  test('an impossible position is still notated, and says why it is odd', () => {
    // King and pawn against a lone pawn: an ordinary thing to draw for a
    // child, and not a position any game could be in.
    const position = toPosition({
      pieces: [
        { square: 'e6', color: 'white', piece: 'king' },
        { square: 'e5', color: 'white', piece: 'pawn' },
        { square: 'a7', color: 'black', piece: 'pawn' },
      ],
    })
    strictEqual(position.fen, '8/p7/4K3/4P3/8/8/8/8 w - - 0 1')
    strictEqual(position.legal, false)
    match(position.problems.join(' '), /black king/i)
    // The editor, not the analysis board — analysis would refuse it.
    match(position.lichess, /lichess\.org\/editor\//)
  })

  test('a piece on a square that does not exist is dropped and reported', () => {
    const position = toPosition({
      pieces: [
        { square: 'e1', color: 'white', piece: 'king' },
        { square: 'e8', color: 'black', piece: 'king' },
        { square: 'j9', color: 'white', piece: 'rook' },
      ],
    })
    strictEqual(position.pieces, 2)
    strictEqual(position.legal, true)
    match(position.problems.join(' '), /j9/)
  })

  test('two pieces read onto one square keeps the first and says so', () => {
    const position = toPosition({
      pieces: [
        { square: 'e1', color: 'white', piece: 'king' },
        { square: 'e8', color: 'black', piece: 'king' },
        { square: 'd4', color: 'white', piece: 'queen' },
        { square: 'd4', color: 'black', piece: 'knight' },
      ],
    })
    ok(position.fen.includes('3Q4'), position.fen)
    match(position.problems.join(' '), /two pieces .* d4/)
  })

  test('a board with nothing on it says nothing was read, and does not throw', () => {
    const position = toPosition({ pieces: [] })
    strictEqual(position.fen, '8/8/8/8/8/8/8/8 w - - 0 1')
    strictEqual(position.legal, false)
    match(position.problems.join(' '), /no pieces/)
  })
})

describe('a page of several diagrams', () => {
  test('each one is notated, in the order they were read', () => {
    const positions = toPositions([
      { label: 'Puzzle 1', pieces: startingPieces() },
      { label: 'Puzzle 2', pieces: startingPieces(), sideToMove: 'black' },
    ])
    strictEqual(positions.length, 2)
    deepStrictEqual(
      positions.map((p) => p.label),
      ['Puzzle 1', 'Puzzle 2'],
    )
    ok(positions[0]!.fen.includes(' w '))
    ok(positions[1]!.fen.includes(' b '))
  })

  test('a page with no diagrams on it is not an error', () => {
    deepStrictEqual(toPositions(undefined), [])
    deepStrictEqual(toPositions([]), [])
  })

  test('the links carry the position both sites can open', () => {
    const [position] = toPositions([{ pieces: startingPieces() }])
    strictEqual(
      position!.lichess,
      'https://lichess.org/analysis/standard/rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR_w_KQkq_-_0_1',
    )
    strictEqual(
      position!.chessCom,
      'https://www.chess.com/analysis?fen=rnbqkbnr%2Fpppppppp%2F8%2F8%2F8%2F8%2FPPPPPPPP%2FRNBQKBNR%20w%20KQkq%20-%200%201',
    )
  })
})

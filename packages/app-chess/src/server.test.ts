/**
 * The geometry that decides what gets cropped (BHCS-107).
 *
 * Every failure this guards against is silent. A box read in the wrong
 * convention, or padded into the diagram next door, produces a crop of the
 * wrong squares — and the position that comes back is a perfectly legal,
 * perfectly wrong chess position with nothing to flag it.
 */

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, test } from 'node:test'

import { padBox, toBox } from './server'

describe('reading a located box', () => {
  test('[ymin, xmin, ymax, xmax] on a 0-1000 scale becomes fractions', () => {
    // The order is Gemini's, not the reading order a person would guess, and
    // getting it backwards crops a board's mirror image somewhere else.
    deepStrictEqual(toBox([100, 200, 300, 600]), {
      top: 0.1,
      left: 0.2,
      bottom: 0.3,
      right: 0.6,
    })
  })

  test('corners given the wrong way round are still a box', () => {
    deepStrictEqual(toBox([300, 600, 100, 200]), toBox([100, 200, 300, 600]))
  })

  test('nonsense is refused rather than cropped', () => {
    strictEqual(toBox(undefined), null)
    strictEqual(toBox([1, 2, 3]), null)
    strictEqual(toBox(['a', 'b', 'c', 'd']), null)
    strictEqual(toBox([100, 200, 100, 600]), null, 'a box with no height')
  })
})

describe('widening a box without reaching into the next board', () => {
  /**
   * Three boards in a row with a narrow gutter between them — the layout of a
   * nine-puzzle sheet, where the pad is wider than the gap and so has to be
   * clipped.
   */
  const a = { left: 0.0, top: 0.1, right: 0.2, bottom: 0.3 }
  const b = { left: 0.21, top: 0.1, right: 0.41, bottom: 0.3 }
  const c = { left: 0.42, top: 0.1, right: 0.62, bottom: 0.3 }
  /** And one below the middle of the row, close enough for the pad to reach. */
  const below = { left: 0.21, top: 0.31, right: 0.41, bottom: 0.51 }

  test('a board with nothing beside it gets the full pad', () => {
    const padded = padBox(a, [a])
    ok(padded.left < a.left && padded.right > a.right)
    ok(padded.top < a.top && padded.bottom > a.bottom)
  })

  test('a neighbour stops the crop at its own edge, not inside it', () => {
    const padded = padBox(b, [a, b, c])
    strictEqual(padded.left, a.right, 'stops where the board to the left ends')
    strictEqual(padded.right, c.left, 'stops where the board to the right begins')
    // The axis with room is still padded — this is the whole point of clipping
    // per edge rather than shrinking the pad everywhere.
    ok(padded.top < b.top, 'and still reaches above and below')
    ok(padded.bottom > b.bottom)
  })

  test('never smaller than the box it started from', () => {
    // Clipping must not eat into the board itself, or the outer file is lost.
    const padded = padBox(b, [a, b, c, below])
    ok(padded.left <= b.left && padded.right >= b.right)
    ok(padded.top <= b.top && padded.bottom >= b.bottom)
  })

  test('a board on the diagonal is not in the way', () => {
    // `c` is neither above nor beside `below`; it must not clip anything.
    const withDiagonal = padBox(below, [below, c])
    const alone = padBox(below, [below])
    deepStrictEqual(withDiagonal, alone)
  })

  test('a board underneath limits only the bottom edge', () => {
    const padded = padBox(b, [b, below])
    strictEqual(padded.bottom, below.top, 'stops at the board below')
    ok(padded.left < b.left, 'and the sides are untouched by it')
    ok(padded.top < b.top)
  })

  test('a neighbour further away than the pad reaches changes nothing', () => {
    // The pad is the normal case; clipping is the exception, and a page with
    // generous margins should not be cropped tighter than a crowded one.
    const far = { left: 0.21, top: 0.9, right: 0.41, bottom: 1 }
    deepStrictEqual(padBox(b, [b, far]), padBox(b, [b]))
  })
})

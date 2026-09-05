/**
 * Cutting a rectangle out of a photograph (BHCS-107).
 *
 * JPEG is lossy, so every colour assertion here allows a wide tolerance. What
 * is being tested is that the right *pixels* came out, not that they survived
 * re-encoding byte-for-byte.
 */

import { strictEqual, ok } from 'node:assert/strict'
import { describe, test } from 'node:test'
import { encode } from 'jpeg-js'

import { cropJpeg, decodeJpeg, isJpeg } from './crop.js'

/** A 200×100 image: red on the left half, blue on the right. */
function twoTone(): Buffer {
  const [width, height] = [200, 100]
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const left = x < width / 2
      data[i] = left ? 220 : 20
      data[i + 1] = 20
      data[i + 2] = left ? 20 : 220
      data[i + 3] = 255
    }
  }
  return Buffer.from(encode({ data, width, height }, 100).data)
}

/** The average colour of a crop, so a lossy round trip does not matter. */
function averageColor(jpeg: Buffer) {
  const { data } = decodeJpeg(jpeg)
  let r = 0
  let b = 0
  const pixels = data.length / 4
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]!
    b += data[i + 2]!
  }
  return { r: r / pixels, b: b / pixels }
}

describe('cropping a region out of a capture', () => {
  test('takes the pixels the box asked for', () => {
    const image = decodeJpeg(twoTone())

    const left = cropJpeg(image, { left: 0, top: 0, right: 0.4, bottom: 1 })!
    const right = cropJpeg(image, { left: 0.6, top: 0, right: 1, bottom: 1 })!

    ok(averageColor(left).r > 180, 'the left of the image is the red half')
    ok(averageColor(right).b > 180, 'the right of the image is the blue half')
  })

  test('the crop comes out the size the box describes', () => {
    const image = decodeJpeg(twoTone())
    const { width, height } = decodeJpeg(
      cropJpeg(image, { left: 0.25, top: 0.2, right: 0.75, bottom: 0.8 })!,
    )
    strictEqual(width, 100)
    strictEqual(height, 60)
  })

  test('a box running past the edge is clamped, not refused', () => {
    // What a model reporting normalized coordinates does at a margin, and the
    // moment a board an inch from the edge would otherwise be lost.
    const image = decodeJpeg(twoTone())
    const crop = cropJpeg(image, { left: -0.2, top: -0.5, right: 1.4, bottom: 2 })!
    const { width, height } = decodeJpeg(crop)
    strictEqual(width, 200)
    strictEqual(height, 100)
  })

  test('a collapsed or nonsense box produces nothing rather than a 1×1 call', () => {
    const image = decodeJpeg(twoTone())
    strictEqual(cropJpeg(image, { left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 }), null)
    strictEqual(cropJpeg(image, { left: 0.5, top: 0, right: 0.52, bottom: 1 }), null)
    strictEqual(
      cropJpeg(image, { left: NaN, top: NaN, right: NaN, bottom: NaN }),
      null,
    )
  })

  test('only JPEG is croppable, which is what the camera produces', () => {
    ok(isJpeg('image/jpeg'))
    ok(!isJpeg('image/png'))
    ok(!isJpeg('application/pdf'))
  })
})

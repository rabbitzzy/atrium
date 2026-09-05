/**
 * Cutting a rectangle out of a captured photograph (BHCS-107).
 *
 * Platform code in the strict sense: it knows an image and a box, and nothing
 * about what the box contains. An app asks for a closer look at a region; this
 * is what produces the picture that gets looked at.
 *
 * `jpeg-js` rather than `sharp`, for one reason that decides it: the API is
 * bundled by esbuild into a single file (`scripts/build-api.mjs`), and a native
 * module cannot be bundled. Pure JS costs about 1.4s to decode a 24-megapixel
 * phone photo and 90ms per crop — measured on the real capture this was built
 * for — which is a fraction of the model call it feeds.
 */

import { decode, encode } from 'jpeg-js'

/** A box in fractions of the whole image, as an app declares it. */
export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** JPEG quality for the crops. High: the crop exists to be read closely. */
const QUALITY = 90

/**
 * The smallest crop worth sending.
 *
 * A box that has collapsed — a model reporting nonsense coordinates, or a
 * region genuinely off the edge — must not become a 1×1 image and a wasted
 * model call.
 */
const MIN_SIDE = 16

/**
 * A decoded photograph, so a page of nine regions is decoded once rather than
 * nine times. Decoding is the expensive half; cropping from it is not.
 */
export interface Decoded {
  data: Uint8Array
  width: number
  height: number
}

export function decodeJpeg(image: Buffer): Decoded {
  const { data, width, height } = decode(image, { useTArray: true })
  return { data, width, height }
}

/** Whether this capture can be cropped at all. */
export function isJpeg(mimeType: string): boolean {
  return mimeType === 'image/jpeg' || mimeType === 'image/jpg'
}

/**
 * Cut `box` out of `image`, as a JPEG.
 *
 * Boxes are clamped to the image rather than rejected: a model asked for a
 * region in normalized coordinates will occasionally hand back one that runs a
 * little past an edge, and a board an inch from the margin is exactly when
 * that happens. Clamping reads the paper; refusing reads nothing.
 *
 * Returns null when there is no sensible rectangle left after clamping.
 */
export function cropJpeg(image: Decoded, box: Box): Buffer | null {
  const left = clamp(box.left, image.width)
  const top = clamp(box.top, image.height)
  const right = clamp(box.right, image.width)
  const bottom = clamp(box.bottom, image.height)

  const width = right - left
  const height = bottom - top
  if (width < MIN_SIDE || height < MIN_SIDE) return null

  const out = new Uint8Array(width * height * 4)
  const stride = width * 4
  for (let row = 0; row < height; row++) {
    const from = ((top + row) * image.width + left) * 4
    out.set(image.data.subarray(from, from + stride), row * stride)
  }

  return Buffer.from(encode({ data: out, width, height }, QUALITY).data)
}

function clamp(fraction: number, extent: number): number {
  if (!Number.isFinite(fraction)) return 0
  return Math.max(0, Math.min(extent, Math.round(fraction * extent)))
}

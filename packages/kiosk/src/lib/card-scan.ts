/**
 * Finding the Card code on a page the camera just took (BHCS-37).
 *
 * The platform half of the round trip. `@atrium/card-qr` knows what the payload
 * means; this knows how to get it out of pixels, which needs the canvas and
 * therefore belongs here rather than in a pure helper.
 *
 * Nothing here learns what a worksheet is. A Card code says which student and
 * which task, and both are platform facts — the same two things `captures`
 * already stores. What the task turns out to be about is the app's business.
 *
 * ── Why it searches the corner first ──
 *
 * jsQR scans the whole buffer, and the whole buffer is a 2000×2400 photograph
 * of a mostly-white page. The code is printed in a known place: BHCS-36 fixes
 * the layout, so the QR is always in the top-right of the header band. Trying
 * that crop first turns the usual case into a search over a few percent of the
 * pixels, and only a failure pays for the full-page scan.
 *
 * That matters because this runs on the 30-second scan-to-Debrief budget, on a
 * Chromebox, in the same tick as the upload.
 */

import jsQR from 'jsqr'
import { decodeCardQr, type CardIdentity, type DecodeFailure } from '@atrium/card-qr'

/**
 * Where the QR sits on a Card, as fractions of the page — generous around the
 * 22mm code so a slightly skewed capture still contains it. Kept in step with
 * `worksheet-print`'s template by being deliberately loose rather than exact.
 */
const QR_CORNER = { x: 0.62, y: 0.0, w: 0.38, h: 0.22 }

export type ScanResult =
  | { found: true; identity: CardIdentity }
  | { found: false; reason: DecodeFailure }

function scan(data: ImageData): string | null {
  // `dontInvert` — a Card is dark-on-light and always will be. Letting jsQR try
  // the inverted pass as well doubles the work to support a case that cannot
  // occur on paper this station printed.
  const found = jsQR(data.data, data.width, data.height, { inversionAttempts: 'dontInvert' })
  return found?.data ?? null
}

/**
 * Read the Card identity out of a captured frame.
 *
 * Takes a canvas rather than an image so the caller can hand over the *cropped,
 * upright* page it already produced — the same one it is about to upload.
 * Scanning the raw frame would mean finding the code against the desk.
 */
export function readCardIdentity(canvas: HTMLCanvasElement): ScanResult {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { found: false, reason: 'not-a-card' }

  const sx = Math.floor(canvas.width * QR_CORNER.x)
  const sy = Math.floor(canvas.height * QR_CORNER.y)
  const sw = Math.max(1, Math.floor(canvas.width * QR_CORNER.w))
  const sh = Math.max(1, Math.floor(canvas.height * QR_CORNER.h))

  // The known corner first, the whole page only if that misses.
  let text = scan(ctx.getImageData(sx, sy, sw, sh))
  if (text === null) text = scan(ctx.getImageData(0, 0, canvas.width, canvas.height))
  if (text === null) return { found: false, reason: 'not-a-card' }

  const decoded = decodeCardQr(text)
  return decoded.ok
    ? { found: true, identity: decoded.identity }
    : { found: false, reason: decoded.reason }
}

export { DECODE_MESSAGE } from '@atrium/card-qr'
export type { CardIdentity, DecodeFailure } from '@atrium/card-qr'

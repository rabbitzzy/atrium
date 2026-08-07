/**
 * Find the sheet of paper in the camera frame, by its four corners.
 *
 * The station's overhead camera sees a lot of desk, and a student will never
 * place a page perfectly square. Cropping to a fixed rectangle therefore does
 * two bad things at once: it keeps desk that the model has to look past, and it
 * keeps whatever rotation the page happened to land at.
 *
 * An earlier note in paper.ts argued this could not work — that "a light wooden
 * desk under the LED measures nearly as bright as paper, so the bright-region
 * bounding box covers essentially the whole frame". Measured on this station,
 * that is not so. The frame's luminance histogram is cleanly bimodal: desk sits
 * around 80–135, paper around 208–255, with an empty valley between 136 and
 * 207. A threshold placed in that valley separates them outright, so this needs
 * no contour library and no OpenCV — Otsu finds the valley on its own, and
 * finds it again under different lighting, which a hard-coded threshold would
 * not.
 *
 * Detection runs on a downscaled copy. Paper edges are a huge, low-frequency
 * feature; resolving them does not need 11.9 megapixels, and working small
 * keeps this cheap enough to run on every preview frame.
 */

/** A point in normalized 0–1 frame coordinates. */
export interface Point {
  x: number
  y: number
}

/** Four corners in normalized frame coordinates, clockwise from top-left. */
export interface Quad {
  tl: Point
  tr: Point
  br: Point
  bl: Point
}

export interface Detection {
  quad: Quad | null
  /** Why it failed, when it did — this is the first thing to look at on a bad capture. */
  reason: string | null
  /** Fraction of the frame the detected page covers. */
  coverage: number
  /** How far the quad departs from a parallelogram, as a fraction of its size. */
  skew: number
}

/** Detection resolution. Big enough to place an edge within a pixel or two of the frame. */
const WORK_WIDTH = 480

/** A page smaller than this is probably a stray bright object; larger is probably the whole desk. */
const MIN_COVERAGE = 0.12
const MAX_COVERAGE = 0.96

/**
 * Otsu's method: pick the threshold that best separates the histogram into two
 * classes. Chosen over a fixed cut because it re-derives itself whenever the
 * lighting changes, which at a shared station it will.
 */
function otsuThreshold(hist: Uint32Array, total: number): number {
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]!

  let sumB = 0
  let wB = 0
  let best = 0
  let bestVar = -1

  for (let t = 0; t < 256; t++) {
    wB += hist[t]!
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]!
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > bestVar) {
      bestVar = between
      best = t
    }
  }
  return best
}

/**
 * Largest connected run of bright pixels, as a labelled mask.
 *
 * The page is one blob; a highlight on the desk, the camera's own base, or a
 * student's sleeve are others. Taking only the biggest component means a
 * second bright object in frame cannot stretch the corners out to meet it,
 * which is the failure a plain bright-pixel bounding box would have.
 */
function largestComponent(bright: Uint8Array, w: number, h: number): { mask: Uint8Array; size: number } {
  const label = new Int32Array(w * h).fill(-1)
  const stack: number[] = []
  let bestStart = -1
  let bestSize = 0
  let current = 0

  for (let seed = 0; seed < bright.length; seed++) {
    if (!bright[seed] || label[seed] !== -1) continue
    let size = 0
    stack.push(seed)
    label[seed] = current
    while (stack.length) {
      const p = stack.pop()!
      size++
      const x = p % w
      const y = (p / w) | 0
      // 4-connectivity is enough; paper is a solid blob, not a thin diagonal.
      if (x > 0 && bright[p - 1] && label[p - 1] === -1) { label[p - 1] = current; stack.push(p - 1) }
      if (x < w - 1 && bright[p + 1] && label[p + 1] === -1) { label[p + 1] = current; stack.push(p + 1) }
      if (y > 0 && bright[p - w] && label[p - w] === -1) { label[p - w] = current; stack.push(p - w) }
      if (y < h - 1 && bright[p + w] && label[p + w] === -1) { label[p + w] = current; stack.push(p + w) }
    }
    if (size > bestSize) {
      bestSize = size
      bestStart = current
    }
    current++
  }

  const mask = new Uint8Array(w * h)
  if (bestStart >= 0) {
    for (let i = 0; i < label.length; i++) if (label[i] === bestStart) mask[i] = 1
  }
  return { mask, size: bestSize }
}

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Detect the page.
 *
 * Corners come from the extremes of x+y and x−y over the page blob, which picks
 * out the four corners of any quadrilateral rotated less than ~45°. Beyond that
 * the page is closer to the next quarter turn anyway, and `pageUp` — not this —
 * is what decides which edge is the top.
 */
export function detectPage(source: CanvasImageSource, width: number, height: number): Detection {
  const fail = (reason: string, coverage = 0): Detection => ({ quad: null, reason, coverage, skew: 0 })
  if (!width || !height) return fail('no frame')

  const w = WORK_WIDTH
  const h = Math.max(1, Math.round((WORK_WIDTH * height) / width))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return fail('no canvas context')
  ctx.drawImage(source, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  const gray = new Uint8Array(w * h)
  const hist = new Uint32Array(256)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = (0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!) | 0
    gray[p] = g
    hist[g]!++
  }

  const threshold = otsuThreshold(hist, w * h)
  const bright = new Uint8Array(w * h)
  for (let i = 0; i < gray.length; i++) bright[i] = gray[i]! > threshold ? 1 : 0

  const { mask, size } = largestComponent(bright, w, h)
  const coverage = size / (w * h)
  if (coverage < MIN_COVERAGE) return fail('no page-sized bright region', coverage)
  if (coverage > MAX_COVERAGE) return fail('bright region fills the frame', coverage)

  let tl = -1, tr = -1, br = -1, bl = -1
  let minSum = Infinity, maxSum = -Infinity, minDiff = Infinity, maxDiff = -Infinity
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (!mask[p]) continue
      const sum = x + y
      const diff = x - y
      if (sum < minSum) { minSum = sum; tl = p }
      if (sum > maxSum) { maxSum = sum; br = p }
      if (diff > maxDiff) { maxDiff = diff; tr = p }
      if (diff < minDiff) { minDiff = diff; bl = p }
    }
  }
  if (tl < 0 || tr < 0 || br < 0 || bl < 0) return fail('could not place corners', coverage)

  const pt = (p: number): Point => ({ x: (p % w) / w, y: ((p / w) | 0) / h })
  const quad: Quad = { tl: pt(tl), tr: pt(tr), br: pt(br), bl: pt(bl) }

  // Opposite sides of a rectangle stay roughly equal under any view a camera
  // bolted above a desk can produce. Wildly unequal ones mean the blob is not a
  // page — a hand across a corner, or the sheet running off the frame.
  const top = dist(quad.tl, quad.tr)
  const bottom = dist(quad.bl, quad.br)
  const left = dist(quad.tl, quad.bl)
  const right = dist(quad.tr, quad.br)
  if (Math.min(top, bottom, left, right) < 0.05) return fail('degenerate quad', coverage)

  const ratio = (a: number, b: number) => Math.max(a, b) / Math.min(a, b)
  const skew = Math.max(ratio(top, bottom), ratio(left, right)) - 1
  if (skew > 0.35) return fail('not a rectangle in perspective', coverage)

  return { quad, reason: null, coverage, skew }
}

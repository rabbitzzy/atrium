/**
 * Flatten a detected page quad into an upright rectangle.
 *
 * The page lies flat on the desk under a fixed overhead camera, so what the
 * lens does to it is a homography — mostly rotation, plus a mild keystone that
 * grows as the sheet sits further off the optical axis. Measured on this
 * station with a page placed normally: corner angles 92/90/89/89, opposite
 * sides differing by 2.8%, and the two diagonal midpoints 43px apart across a
 * ~2900px page. Correcting only the rotation would leave that last 1.5% —
 * around 40px of error at the far corner — so the projective term is worth
 * carrying.
 *
 * Canvas 2D has no projective transform, so the output is covered with a grid
 * of cells and each cell drawn under its own affine transform. Piecewise-affine
 * converges on the true homography as the grid tightens; at the distortion
 * measured here a 10x10 grid puts the residual well under a pixel.
 */

import type { Point, Quad } from './page-detect'

/** Projective map from the unit square onto a quad. */
interface Projection {
  a: number; b: number; c: number
  d: number; e: number; f: number
  g: number; h: number
}

/**
 * Solve the unit-square-to-quad projection.
 *
 * Closed form rather than a general least-squares solve: four correspondences
 * determine the eight parameters exactly, so there is nothing to fit.
 */
function squareToQuad(p0: Point, p1: Point, p2: Point, p3: Point): Projection {
  const dx1 = p1.x - p2.x
  const dx2 = p3.x - p2.x
  const dx3 = p0.x - p1.x + p2.x - p3.x
  const dy1 = p1.y - p2.y
  const dy2 = p3.y - p2.y
  const dy3 = p0.y - p1.y + p2.y - p3.y

  // An exactly parallel quad has no projective term; the general branch would
  // divide by zero reaching for it.
  if (dx3 === 0 && dy3 === 0) {
    return {
      a: p1.x - p0.x, b: p2.x - p1.x, c: p0.x,
      d: p1.y - p0.y, e: p2.y - p1.y, f: p0.y,
      g: 0, h: 0,
    }
  }

  const den = dx1 * dy2 - dy1 * dx2
  const g = (dx3 * dy2 - dy3 * dx2) / den
  const h = (dx1 * dy3 - dy1 * dx3) / den
  return {
    a: p1.x - p0.x + g * p1.x,
    b: p3.x - p0.x + h * p3.x,
    c: p0.x,
    d: p1.y - p0.y + g * p1.y,
    e: p3.y - p0.y + h * p3.y,
    f: p0.y,
    g,
    h,
  }
}

/** Where output point (u,v), each 0–1, sits in the source image. */
function project(m: Projection, u: number, v: number): Point {
  const w = m.g * u + m.h * v + 1
  return { x: (m.a * u + m.b * v + m.c) / w, y: (m.d * u + m.e * v + m.f) / w }
}

/**
 * Reorder the quad's corners so that `n` counter-clockwise quarter turns of the
 * frame would bring the page upright.
 *
 * Rotating the image is the obvious way to do this and the wrong one — it costs
 * a second full-size pass and a second resample. Permuting which detected
 * corner is treated as the output's top-left gets the same result inside the
 * warp that has to happen anyway.
 */
function orient(quad: Quad, ccwTurns: number): Point[] {
  const corners = [quad.tl, quad.tr, quad.br, quad.bl]
  return [0, 1, 2, 3].map((i) => corners[(i + ccwTurns) % 4]!)
}

/** Draw a triangle of the source into the output under an affine transform. */
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  s0: Point, s1: Point, s2: Point,
  o0: Point, o1: Point, o2: Point,
): void {
  const s10x = s1.x - s0.x, s10y = s1.y - s0.y
  const s20x = s2.x - s0.x, s20y = s2.y - s0.y
  const det = s10x * s20y - s20x * s10y
  if (!det) return

  const o10x = o1.x - o0.x, o10y = o1.y - o0.y
  const o20x = o2.x - o0.x, o20y = o2.y - o0.y

  const a = (o10x * s20y - o20x * s10y) / det
  const c = (o20x * s10x - o10x * s20x) / det
  const b = (o10y * s20y - o20y * s10y) / det
  const d = (o20y * s10x - o10y * s20x) / det
  const e = o0.x - a * s0.x - c * s0.y
  const f = o0.y - b * s0.x - d * s0.y

  ctx.save()
  // Nudge the clip outward from the centroid. Adjacent cells otherwise share an
  // antialiased edge that blends toward transparent on both sides, leaving a
  // visible seam lattice across the page.
  const cx = (o0.x + o1.x + o2.x) / 3
  const cy = (o0.y + o1.y + o2.y) / 3
  const grow = (p: Point): Point => {
    const dx = p.x - cx
    const dy = p.y - cy
    const len = Math.hypot(dx, dy) || 1
    return { x: p.x + (dx / len) * 0.7, y: p.y + (dy / len) * 0.7 }
  }
  const g0 = grow(o0), g1 = grow(o1), g2 = grow(o2)

  ctx.beginPath()
  ctx.moveTo(g0.x, g0.y)
  ctx.lineTo(g1.x, g1.y)
  ctx.lineTo(g2.x, g2.y)
  ctx.closePath()
  ctx.clip()
  ctx.transform(a, b, c, d, e, f)
  ctx.drawImage(source, 0, 0)
  ctx.restore()
}

/** Grid density. 10 puts the piecewise-affine residual below a pixel here. */
const GRID = 10

/**
 * Headroom over the output's long edge for the intermediate copy. A little
 * slack keeps detail that the final resample would otherwise have to invent,
 * without paying for pixels nothing will ever read.
 */
const INTERMEDIATE_SCALE = 1.15

/** Reused across captures; allocating an ~8MP canvas per frame is not free. */
let intermediate: HTMLCanvasElement | null = null

/**
 * Resize only when the size actually changes.
 *
 * Assigning to canvas.width reallocates and clears the backing store even when
 * the value is identical, and at these sizes the browser defers that cost to
 * after the callback returns — which is how a 200ms timer came to take 950ms
 * and a warm capture 8s. Guarding the assignment is most of that time back.
 */
function resize(canvas: HTMLCanvasElement, width: number, height: number): void {
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
}

/**
 * Warp the detected page onto `canvas`, upright and deskewed.
 *
 * `outWidth`/`outHeight` are the upright page's dimensions, derived from the
 * paper's true aspect ratio rather than from the quad — which also corrects the
 * slight aspect error the camera introduces.
 */
export function warpQuad(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  quad: Quad,
  ccwTurns: number,
  outWidth: number,
  outHeight: number,
): void {
  resize(canvas, outWidth, outHeight)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a 2D canvas context')
  ctx.imageSmoothingQuality = 'high'
  // Reused canvases keep the previous capture's pixels where the new page does
  // not cover them; a stale sliver at the edge would be a genuinely confusing
  // thing to find in a stored image.
  ctx.clearRect(0, 0, outWidth, outHeight)

  /*
   * Copy the page's bounding box into an intermediate canvas first, and warp
   * from that.
   *
   * Not a micro-optimisation — it is the difference between this being usable
   * and not. Every triangle below is a clipped drawImage of the whole source,
   * and the browser resamples the entire source for each one: from a 3840x3104
   * frame, 200 triangles measured 9397ms. Copying the page region down to
   * roughly output size first costs one drawImage and brings the same warp to
   * 52ms.
   */
  const xs = [quad.tl.x, quad.tr.x, quad.br.x, quad.bl.x]
  const ys = [quad.tl.y, quad.tr.y, quad.br.y, quad.bl.y]
  const x0 = Math.max(0, Math.min(...xs))
  const x1 = Math.min(1, Math.max(...xs))
  const y0 = Math.max(0, Math.min(...ys))
  const y1 = Math.min(1, Math.max(...ys))
  const boxW = Math.max(1, Math.round((x1 - x0) * sourceWidth))
  const boxH = Math.max(1, Math.round((y1 - y0) * sourceHeight))

  const cap = Math.max(outWidth, outHeight) * INTERMEDIATE_SCALE
  const shrink = Math.min(1, cap / Math.max(boxW, boxH))

  intermediate ??= document.createElement('canvas')
  resize(intermediate, Math.max(1, Math.round(boxW * shrink)), Math.max(1, Math.round(boxH * shrink)))
  const ictx = intermediate.getContext('2d')
  if (!ictx) throw new Error('Could not get a 2D canvas context')
  ictx.imageSmoothingQuality = 'high'
  ictx.drawImage(
    source,
    x0 * sourceWidth, y0 * sourceHeight, boxW, boxH,
    0, 0, intermediate.width, intermediate.height,
  )

  // The quad's corners, restated against the intermediate.
  const local = (p: Point): Point => ({
    x: ((p.x - x0) / (x1 - x0)) * intermediate!.width,
    y: ((p.y - y0) / (y1 - y0)) * intermediate!.height,
  })

  const [p0, p1, p2, p3] = orient(quad, ccwTurns) as [Point, Point, Point, Point]
  const m = squareToQuad(local(p0), local(p1), local(p2), local(p3))

  // Source position of every output grid vertex, computed once and shared by
  // the cells on either side of it.
  const src: Point[][] = []
  for (let row = 0; row <= GRID; row++) {
    const line: Point[] = []
    for (let col = 0; col <= GRID; col++) line.push(project(m, col / GRID, row / GRID))
    src.push(line)
  }

  const cellW = outWidth / GRID
  const cellH = outHeight / GRID

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const o00 = { x: col * cellW, y: row * cellH }
      const o10 = { x: (col + 1) * cellW, y: row * cellH }
      const o11 = { x: (col + 1) * cellW, y: (row + 1) * cellH }
      const o01 = { x: col * cellW, y: (row + 1) * cellH }

      const s00 = src[row]![col]!
      const s10 = src[row]![col + 1]!
      const s11 = src[row + 1]![col + 1]!
      const s01 = src[row + 1]![col]!

      drawTriangle(ctx, intermediate, s00, s10, s11, o00, o10, o11)
      drawTriangle(ctx, intermediate, s00, s11, s01, o00, o11, o01)
    }
  }
}

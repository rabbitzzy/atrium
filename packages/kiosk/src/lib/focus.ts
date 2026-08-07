/**
 * Focus measurement.
 *
 * Variance of the Laplacian — the standard no-reference focus metric. High
 * variance means strong local intensity changes, which is what an in-focus
 * edge looks like; blur smooths them away.
 *
 * This exists because resolution and sharpness are independent, and optimising
 * one silently cost us the other: ImageCapture.takePhoto() returns a 3840x3104
 * still where the preview gives 640x480, but measured ~12x less sharp at
 * matched render size, because the full-resolution sensor read does not wait
 * for autofocus to converge.
 *
 * Scores are normalised to a fixed working width before tiling. Without that
 * the metric is scale-dependent — the same image scores 19 / 31 / 57 / 85
 * rendered at 400 / 640 / 1200 / 1855px — which makes comparing two sources of
 * different sizes meaningless, and makes any absolute threshold a fiction.
 * Normalising asks the size-independent question: of these two shots of the
 * same page, which is better focused?
 */

/** Tile grid used for scoring. Small enough to be cheap, large enough to be stable. */
const TILE = 160
const GRID = 5

/**
 * Every source is resampled to this width before scoring, so scores compare
 * across a 640px preview and a 3840px still. A small image upscaled to reach it
 * scores lower, which is correct: it genuinely carries less detail.
 */
const WORKING_WIDTH = 1000

/**
 * Score an image source over a tiled grid, returning a high percentile.
 *
 * A single whole-image measurement is dominated by blank paper: a sharp scan of
 * a mostly-empty worksheet scores lower than a blurry scan of a dense drawing.
 * Taking the 90th percentile tile asks a better question — "is the sharpest
 * content in this frame actually sharp?" — which is content-independent enough
 * to compare two shots of the same page.
 */
export function focusScore(
  source: CanvasImageSource,
  width: number,
  height: number,
): number {
  // Resample to the common working size first — this is what makes scores from
  // differently-sized sources comparable.
  const workW = WORKING_WIDTH
  const workH = Math.max(1, Math.round((WORKING_WIDTH * height) / width))
  const work = document.createElement('canvas')
  work.width = workW
  work.height = workH
  const workCtx = work.getContext('2d')
  if (!workCtx) return 0
  workCtx.drawImage(source, 0, 0, workW, workH)

  const canvas = document.createElement('canvas')
  canvas.width = TILE
  canvas.height = TILE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 0

  const scores: number[] = []
  const tileW = workW / GRID
  const tileH = workH / GRID

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      ctx.drawImage(work, col * tileW, row * tileH, tileW, tileH, 0, 0, TILE, TILE)
      const { data } = ctx.getImageData(0, 0, TILE, TILE)

      const gray = new Float32Array(TILE * TILE)
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        gray[p] = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!
      }

      let sum = 0
      let sumSq = 0
      let n = 0
      for (let y = 1; y < TILE - 1; y++) {
        for (let x = 1; x < TILE - 1; x++) {
          const i = y * TILE + x
          const lap = 4 * gray[i]! - gray[i - 1]! - gray[i + 1]! - gray[i - TILE]! - gray[i + TILE]!
          sum += lap
          sumSq += lap * lap
          n++
        }
      }
      scores.push(sumSq / n - (sum / n) ** 2)
    }
  }

  scores.sort((a, b) => a - b)
  return Math.round(scores[Math.floor(0.9 * (scores.length - 1))]!)
}

/**
 * How much sharper the preview must be before we give up the photo's pixels.
 *
 * Resolution is worth real quality, so the higher-resolution still wins ties
 * and near-ties; the preview only takes over when the photo is materially
 * worse — the defocused-takePhoto case, where the gap was ~12x, not 15%.
 * Without this the pipeline would reject a sharp 3840x3104 still in favour of
 * an equally sharp 640x480 preview, which is the opposite of the point.
 */
export const PHOTO_FOCUS_TOLERANCE = 0.85

/**
 * Below this normalised score, a capture is probably not worth OCR'ing.
 *
 * Calibrated at the 1000px working width: a defocused takePhoto scores ~45, a
 * sharp preview several hundred. Provisional, and it warns rather than blocks —
 * a wrong threshold that refuses real work is worse than a soft capture.
 */
export const FOCUS_WARN_BELOW = 120

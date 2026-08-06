/**
 * Focus measurement.
 *
 * Variance of the Laplacian — the standard no-reference focus metric. High
 * variance means strong local intensity changes, which is what an in-focus
 * edge looks like; blur smooths them away.
 *
 * This exists because resolution and sharpness are independent, and optimising
 * one silently cost us the other: ImageCapture.takePhoto() returns a 3840x3104
 * still where the preview gives 640x480, but measured ~34x less sharp, because
 * the full-resolution sensor read does not wait for autofocus to converge.
 * More pixels of a blurrier image is not a better capture. So the pipeline
 * measures both candidates and keeps the sharper one rather than assuming
 * either path wins — which also means it adapts to whatever the production
 * Chromebox does, instead of inheriting a conclusion drawn on macOS.
 */

/** Tile grid used for scoring. Small enough to be cheap, large enough to be stable. */
const TILE = 160
const GRID = 5

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
  const canvas = document.createElement('canvas')
  canvas.width = TILE
  canvas.height = TILE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 0

  const scores: number[] = []
  const tileW = width / GRID
  const tileH = height / GRID

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      ctx.drawImage(source, col * tileW, row * tileH, tileW, tileH, 0, 0, TILE, TILE)
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
 * Below this, a capture is probably not worth OCR'ing.
 *
 * Calibrated on this station: crisply rendered text scores ~12000, the same
 * text under a 2px gaussian blur ~50, a good OKIOCAM preview capture ~1650, and
 * a defocused takePhoto ~48. 250 sits well clear of the blurred cases without
 * tripping on sparse pages. Provisional — it warns, it does not block, because
 * a wrong threshold that refuses real work is worse than a soft capture.
 */
export const FOCUS_WARN_BELOW = 250

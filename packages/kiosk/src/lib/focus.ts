/**
 * Focus measurement.
 *
 * Variance of the Laplacian — the standard no-reference focus metric. High
 * variance means strong local intensity changes, which is what an in-focus
 * edge looks like; blur smooths them away.
 *
 * Scores are normalised to a fixed working width before tiling. Without that
 * the metric is scale-dependent — the same image scores 19 / 31 / 57 / 85
 * rendered at 400 / 640 / 1200 / 1855px — which makes comparing two sources of
 * different sizes meaningless, and makes any absolute threshold a fiction.
 * Normalising asks the size-independent question: of these two shots of the
 * same page, which is better focused?
 *
 * Every score is taken over a region — the page crop, not the whole frame.
 * Desk grain outside the page is high-frequency texture that a whole-frame
 * measurement happily counts as sharpness, so a full-frame score can read 1767
 * while the crop that actually gets OCR'd measures 260. Scoring anything other
 * than the pixels we keep is measuring the wrong image.
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

/** Normalized 0–1 sub-rect of a source. */
export interface Region {
  x: number
  y: number
  width: number
  height: number
}

const WHOLE: Region = { x: 0, y: 0, width: 1, height: 1 }

/*
 * Scoring canvases are reused rather than allocated per call. The focus gate
 * scores several times a second for seconds at a time, and a fresh pair of
 * canvases each time was enough garbage to be worth avoiding on its own —
 * quite apart from the reallocation cost guarded against below.
 */
let workCanvas: HTMLCanvasElement | null = null
let tileScratch: HTMLCanvasElement | null = null

const scratch = (): HTMLCanvasElement => (workCanvas ??= document.createElement('canvas'))

const tileCanvas = (): HTMLCanvasElement => {
  if (!tileScratch) {
    tileScratch = document.createElement('canvas')
    tileScratch.width = TILE
    tileScratch.height = TILE
  }
  return tileScratch
}

export interface FocusProfile {
  /** 90th-percentile tile score — stable, and the right one for ranking. */
  p90: number
  /**
   * Sharpest single tile — the right one for judging "is this readable at all".
   *
   * These two answer different questions and neither substitutes for the other.
   * p90 assumes at least a tenth of the page carries content, which a part-done
   * page does not: a genuinely sharp page holding one line of pencil
   * measured p90 101, against 102 and 203 for two visibly blurred captures — no
   * threshold can separate those. The same three by sharpest tile are 434 / 203
   * / 239, which separates cleanly, because "is the sharpest thing on this page
   * sharp?" does not care how much of the page is blank.
   */
  best: number
  /** Every tile, row-major. A sharp page peaks where the content is; a
   *  defocused one is flat, which is how a focus miss is told from a tilt. */
  tiles: number[]
  grid: number
}

/**
 * Score a region of an image source over a tiled grid.
 *
 * A single whole-image measurement is dominated by blank paper: a sharp scan of
 * a mostly-empty page scores lower than a blurry scan of a dense drawing.
 * Taking the 90th percentile tile asks a better question — "is the sharpest
 * content in this frame actually sharp?" — which is content-independent enough
 * to compare two shots of the same page.
 */
export function focusProfile(
  source: CanvasImageSource,
  width: number,
  height: number,
  region: Region = WHOLE,
): FocusProfile {
  const srcX = region.x * width
  const srcY = region.y * height
  const srcW = Math.max(1, region.width * width)
  const srcH = Math.max(1, region.height * height)

  // Resample the region to the common working size first — this is what makes
  // scores from differently-sized sources comparable.
  const workW = WORKING_WIDTH
  const workH = Math.max(1, Math.round((WORKING_WIDTH * srcH) / srcW))
  const work = scratch()
  // Assigning to canvas.width reallocates and clears the backing store even
  // when the value is unchanged, and the browser defers that cost past the end
  // of the call — enough, at the rate the focus gate samples, to stretch a
  // 200ms wait into 950ms. So resize only on an actual change.
  if (work.width !== workW) work.width = workW
  if (work.height !== workH) work.height = workH
  const workCtx = work.getContext('2d')
  if (!workCtx) return { p90: 0, best: 0, tiles: [], grid: GRID }
  workCtx.drawImage(source, srcX, srcY, srcW, srcH, 0, 0, workW, workH)

  const canvas = tileCanvas()
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { p90: 0, best: 0, tiles: [], grid: GRID }

  const tiles: number[] = []
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
      tiles.push(Math.round(sumSq / n - (sum / n) ** 2))
    }
  }

  const sorted = [...tiles].sort((a, b) => a - b)
  return {
    p90: sorted[Math.floor(0.9 * (sorted.length - 1))]!,
    best: sorted[sorted.length - 1]!,
    tiles,
    grid: GRID,
  }
}

/** p90 only — the common case. */
export function focusScore(
  source: CanvasImageSource,
  width: number,
  height: number,
  region?: Region,
): number {
  return focusProfile(source, width, height, region).p90
}

/**
 * Below this *sharpest-tile* score, a capture is probably not worth OCR'ing.
 *
 * Calibrated at the 1000px working width over the crop that actually gets
 * stored, against real captures from this station:
 *
 *   sharp    434 / 1549 / 2041 / 3953   (434 is a part-done page holding a
 *                                        single line of pencil — legible, and
 *                                        the case a p90 threshold gets wrong)
 *   blurred  203 / 239                  (203 and 2041 are the *same* drawing
 *                                        minutes apart, which is the whole bug)
 *
 * 320 is the geometric midpoint of the 239–434 gap. The margin is narrower than
 * one would like, which is a further reason this warns rather than blocks: a
 * threshold that refuses real work is worse than a soft capture.
 */
export const FOCUS_WARN_BELOW = 320

export interface FocusGate {
  /** Did the score plateau, or did we give up and shoot anyway? */
  locked: boolean
  /** How long the gate waited. */
  ms: number
  /** Score at the moment the gate released. */
  score: number
}

/**
 * Wait until focus stops moving.
 *
 * This station's camera runs a full autofocus sweep whenever the stream starts,
 * and the sweep is slow, large, and deceptive. Measured on the OKIOCAM S2 Pro,
 * reproducible to within ~50ms across runs:
 *
 *   0.8s   sharp — the lens is still parked where the last session left it
 *   2–3s   270–465, falling
 *   3.5s   ~110, the bottom of the rack
 *   5–6s   ~1650, converged and then stable indefinitely
 *
 * A capture taken anywhere in the middle of that is ruined, and the early sharp
 * frames are the cruellest part: the preview looks perfect at the exact moment a
 * student would reach for the button.
 *
 * A plateau is the signal, rather than a fixed delay or an absolute score. The
 * sweep swings the score by more than 10x, so "it stopped moving" separates
 * cleanly; and unlike a threshold it needs no assumption about how much ink is
 * on the page, which is the one thing that legitimately varies.
 */
export async function waitForStableFocus(
  read: () => number,
  {
    hz = 5,
    /** Samples that must agree. 6 at 5Hz ≈ 1.2s — longer than any plateau the sweep produces. */
    window = 6,
    tolerance = 0.15,
    minMs = 600,
    /** Cold starts lock at 6–7s; beyond this something else is wrong, so shoot anyway. */
    timeoutMs = 10_000,
  } = {},
): Promise<FocusGate> {
  const t0 = performance.now()
  const recent: number[] = []

  for (;;) {
    const score = read()
    recent.push(score)
    if (recent.length > window) recent.shift()

    const ms = Math.round(performance.now() - t0)
    const hi = Math.max(...recent)
    const lo = Math.min(...recent)
    const settled = recent.length === window && hi > 0 && (hi - lo) / hi <= tolerance

    if (settled && ms >= minMs) return { locked: true, ms, score }
    if (ms >= timeoutMs) return { locked: false, ms, score }

    await new Promise((r) => setTimeout(r, 1000 / hz))
  }
}

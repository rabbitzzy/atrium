/**
 * Paper geometry and crop regions.
 *
 * The overhead camera sees a lot of desk. Cropping to the page before OCR
 * concentrates the model's attention (and our pixel budget) on the work
 * instead of the table.
 *
 * Automatic page detection is deliberately not attempted. Brightness
 * thresholding fails on this station — a light wooden desk under the LED
 * measures nearly as bright as paper, so the bright-region bounding box covers
 * essentially the whole frame — and contour detection would mean shipping
 * OpenCV.js for a problem the physical setup already solves: the camera is
 * fixed-mounted and the paper is one of two known sizes, so the region is
 * knowable in advance. This is the fixed-template argument from
 * docs/research/paper-interaction.md applied to the station rather than the
 * worksheet.
 */

export type Orientation = 'portrait' | 'landscape'

/**
 * Which way the top of the page points in the camera frame.
 *
 * A single control rather than separate orientation and rotation settings: the
 * student answers one physical question ("which way is up?") and both the crop
 * shape and the output rotation follow from it.
 */
export type PageUp = 'top' | 'right' | 'bottom' | 'left'

/**
 * How a page should be laid on this station, given what the camera can see.
 *
 * Measured from the frame rather than declared as a constant, because the
 * frame's shape *is* the reason for the answer: in a landscape frame a portrait
 * letter page fills 55% of it against 84% laid sideways — ~1.5x the area, i.e.
 * ~1.24x linear resolution, for free — and a fallback crop sized for portrait
 * clips the sides of a page the student sensibly placed sideways anyway. Point
 * a portrait-framed camera at the desk and the right answer flips with it,
 * which a hard-coded default would get wrong while still reading as correct.
 *
 * Falls back to a 4:3 assumption before the stream reports a size; nothing is
 * cropped or drawn until it does.
 */
export function defaultPageUp(frameWidth = 4, frameHeight = 3): PageUp {
  return frameWidth >= frameHeight ? 'right' : 'top'
}

export function orientationFor(pageUp: PageUp): Orientation {
  return pageUp === 'top' || pageUp === 'bottom' ? 'portrait' : 'landscape'
}

/**
 * Quarter-turns clockwise needed to bring the page upright.
 *
 * Top-points-right needs a counter-clockwise quarter turn, which is three
 * clockwise ones.
 */
export function quarterTurnsFor(pageUp: PageUp): 0 | 1 | 2 | 3 {
  return pageUp === 'top' ? 0 : pageUp === 'left' ? 1 : pageUp === 'bottom' ? 2 : 3
}

export interface PaperSize {
  label: string
  /** Inches. */
  width: number
  height: number
}

export const PAPER: Record<'letter' | 'halfLetter', PaperSize> = {
  letter: { label: 'Letter 8.5×11', width: 8.5, height: 11 },
  halfLetter: { label: 'Half letter 5.5×8.5', width: 5.5, height: 8.5 },
}

/** Which paper each capture kind normally arrives on. */
export const PAPER_FOR_KIND: Record<string, keyof typeof PAPER> = {
  worksheet: 'letter',
  doodle: 'letter',
  chess: 'halfLetter',
}

/** Normalized rect, 0–1 relative to the frame. */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/** Fraction of the frame the guide fills along its limiting axis. */
const FILL = 0.94

/**
 * Largest rect of the paper's aspect that fits the frame, centered.
 *
 * Slightly under-filling leaves room for a student to be a little off without
 * losing an edge — the failure we care about is clipping content, not wasting
 * a few percent of sensor.
 */
export function cropRegion(
  paper: keyof typeof PAPER,
  orientation: Orientation,
  frameWidth: number,
  frameHeight: number,
): CropRect {
  const { width: w, height: h } = PAPER[paper]
  const paperAspect = orientation === 'portrait' ? w / h : h / w
  const frameAspect = frameWidth / frameHeight

  // Match on whichever axis runs out first.
  const [width, height] =
    paperAspect > frameAspect
      ? [FILL, (FILL * frameAspect) / paperAspect]
      : [(FILL * paperAspect) / frameAspect, FILL]

  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height }
}

/** Pixel rect within a frame of the given size. */
export function toPixels(rect: CropRect, frameWidth: number, frameHeight: number) {
  return {
    sx: Math.round(rect.x * frameWidth),
    sy: Math.round(rect.y * frameHeight),
    sw: Math.round(rect.width * frameWidth),
    sh: Math.round(rect.height * frameHeight),
  }
}

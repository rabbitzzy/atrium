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

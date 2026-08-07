/** Where a capture's pixels ended up. */
export type StorageBackend = 'drive' | 'local'

/**
 * Lifecycle of the extraction attached to a capture row.
 *
 * `skipped` is not a failure: it is what an app without an `extract` step
 * produces, and it is how a doodle is stored without ever being interpreted.
 */
export type OcrStatus = 'pending' | 'ok' | 'failed' | 'skipped'

/**
 * The four tiers a piece of student work can land in. Not a grade — see the
 * Feedback Report section of CLAUDE.md.
 */
export type QualityTier = 'mastered' | 'shaky' | 'needs-help' | 'not-yet'

/**
 * What POST /api/capture returns.
 *
 * `ocr` is deliberately `unknown`: its shape is owned by whichever app handled
 * the capture, and the platform never looks inside it.
 */
export interface CaptureResponse {
  captureId: string
  fileUrl: string
  storageBackend: StorageBackend
  /** The app id this capture was handled by; stored in `captures.kind`. */
  kind: string
  ocrStatus: Exclude<OcrStatus, 'pending'>
  ocrError: string | null
  ocrMs: number | null
  ocr: unknown
}

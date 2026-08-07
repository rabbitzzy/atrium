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

/**
 * The same answer in instalments, for an app whose `extract.stream` is set
 * (BHCS-10). Sent as server-sent events from the same POST /api/capture; an
 * app that has not opted in gets the single JSON body above and never sees
 * any of this.
 *
 * The sequence is `stored`, then any number of `partial`s, then exactly one
 * `done` or `error`. A stream that ends without either was cut off — and
 * `stored` having arrived is what tells the kiosk the image survived it.
 */
export type CaptureStreamEvent =
  /** The pixels are safe and the row exists. Everything after this is recoverable. */
  | { event: 'stored'; data: Pick<CaptureResponse, 'captureId' | 'fileUrl' | 'storageBackend'> }
  /** The extraction so far, in the handling app's own shape with fields missing. */
  | { event: 'partial'; data: unknown }
  /** Identical to what the buffered path would have returned. */
  | { event: 'done'; data: CaptureResponse }
  /** The request failed after the response had already started. */
  | { event: 'error'; data: { error: string } }

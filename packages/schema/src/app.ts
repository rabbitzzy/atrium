/**
 * The capture app contract.
 *
 * One app per thing a student can put under the camera. An app owns its whole
 * vertical: the paper it arrives on, its extraction prompt and schema, its
 * post-processing, and how its result is rendered. The platform owns the
 * camera, the storage, the row, and a registry of these — and nothing else.
 *
 * ── Why this is two interfaces and not one ──────────────────────────────────
 *
 * BHCS-13 specifies a single `CaptureApp`. It cannot be a single object,
 * because the halves run on opposite sides of a wire that already exists:
 * `extract`/`refine` run in the serverless function, `ResultView`/`Resolve`
 * run in the browser. A single object would drag React into the capture
 * lambda and ship every extraction prompt down to the kiosk's client bundle.
 *
 * So the split follows the seam that was already there, and an app package
 * exposes both halves from two entry points:
 *
 *     @atrium/app-chess          → CaptureApp        (browser)
 *     @atrium/app-chess/server   → CaptureAppServer  (function)
 *
 * `id` is the only field both carry, and it is the join. Everything the
 * original contract promised still holds: absence of `extract` is the
 * store-only path, `extract.stream` is BHCS-10, `refine` is where the BHCS-12
 * chess validator runs, `Resolve` is the BHCS-11 board.
 */

import type { FC } from 'react'
import type { GeminiSchema } from './gemini'
import type { PaperId } from './paper'
import type { Student } from './student'

/** Server-side extraction: one schema-constrained multimodal call. */
export interface CaptureExtract {
  schema: GeminiSchema
  systemPrompt: string
  userPrompt: string
  /**
   * Opt into streamed extraction (BHCS-10). Nothing else about the app
   * changes; the platform picks the transport.
   *
   * What the app gets for it is `CaptureApp.StreamView` being rendered with
   * the extraction as it is written. What is stored is identical either way —
   * streaming changes when the kiosk hears, never what lands in the row.
   */
  stream?: boolean
}

/**
 * The same shape, mid-arrival: every field optional, all the way down.
 *
 * This is what a schema-constrained response looks like before it is finished.
 * Arrays are shorter than they will be and their last element is missing
 * fields, but nothing present is ever wrong — a value only appears once it can
 * no longer change. So a `StreamView` renders the fields it has and leaves
 * space for the rest; it never has to unrender anything.
 */
export type Partially<T> = T extends (infer E)[]
  ? Partially<E>[]
  : T extends object
    ? { [K in keyof T]?: Partially<T[K]> }
    : T

/**
 * The half that runs in the capture function.
 *
 * Pure data plus one optional pure function — no React, no DOM. Importing this
 * entry point must never pull a component into the lambda.
 */
export interface CaptureAppServer<Raw = unknown, Result = Raw> {
  /** Stored in `captures.kind`. Stable — it is in the database. */
  id: string

  /**
   * Omit entirely for store-only kinds. That absence *is* the doodle app's
   * pipeline, which is why `runPipeline` has no special case for it.
   */
  extract?: CaptureExtract

  /**
   * Post-processing over the extracted output, server-side, after `extract`
   * and before the row is updated.
   *
   * Never overwrites the raw extraction: the verbatim transcription is the
   * audit trail a teacher needs, so `refine` produces a new object alongside
   * `ocr_json`, never in place of it.
   */
  refine?(raw: Raw): Promise<Result>
}

/**
 * The half that runs at the kiosk: how the app presents itself in the picker,
 * and how its result is rendered.
 */
export interface CaptureApp<Result = unknown> {
  /** Must match the server half's id. */
  id: string

  label: string
  labelZh: string
  icon: string
  blurb: string

  /** Which paper this kind arrives on. Drives the crop guide. */
  paper: PaperId

  /** The second line under the spinner while the capture is in flight. */
  waitHint: string

  /** Replaces the branch in the platform's old ResultCard. */
  ResultView: FC<{ result: Result; student: Student }>

  /**
   * What the student watches while a streamed extraction arrives (BHCS-10).
   * Only ever rendered for an app whose `extract.stream` is set; without it a
   * streaming app simply spins like any other, so the two halves can land
   * separately.
   *
   * It is a second component rather than a flag on `ResultView` because it is
   * a different job: the Debrief is a finished artifact a child reads, and
   * this is the reading-in-progress. Conflating them means every result view
   * defending against absent fields forever, to serve a state that lasts
   * fifteen seconds.
   */
  StreamView?: FC<{ partial: Partially<Result> }>

  /**
   * Optional human-in-the-loop step between the result arriving and the
   * student being done with it. Resolving to a Result means the platform's
   * capture flow never learns an interactive step happened.
   */
  Resolve?: FC<{ result: Result; onResolved: (r: Result) => void }>

  /**
   * Whether this particular result is worth interrupting for.
   *
   * The platform cannot answer this without looking inside a payload it is not
   * allowed to understand, so the app answers it. Absent means "always ask
   * when `Resolve` exists"; a `Resolve` with no `needsResolve` is a step every
   * student pays for whether or not there is anything to fix.
   */
  needsResolve?: (result: Result) => boolean
}

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
import type { GeminiSchema } from './gemini.js'
import type { PaperId } from './paper.js'
import type { Student } from './student.js'

/**
 * Who a capture is for.
 *
 * The platform assembles this from the check-in and hands it to the app; the
 * app reads whatever it has a use for and ignores the rest. It exists so an
 * extraction can be addressed to a particular child without the platform
 * having any opinion about what that changes — pitching feedback to a reading
 * level (BHCS-14) is the first use, and a reading-level estimate from
 * `skill-graph` is the one after it.
 *
 * Nothing here may be depended on: `student.grade` is null for most of the
 * roster and every field that follows it will be at least as sparse.
 */
export interface CaptureContext {
  student: Student

  /**
   * `tasks.id`, when the page carried a Card code the station could read
   * (BHCS-37). Absent for anything else put under the camera — a drawing, a
   * scoresheet, a worksheet printed before Cards existed.
   *
   * As platform-level as `student`, and for the same reason: which task a
   * capture is of says nothing about what the task contains. What it turns out
   * to be about stays the app's business.
   */
  taskId?: string
}

/**
 * A system prompt, or one written for the student in front of the camera.
 *
 * A function rather than a template because what varies is not a slot in a
 * sentence — a prompt addressed to a first-grader and one addressed to a
 * fifth-grader differ in which instructions are present at all.
 *
 * `userPrompt` deliberately stays a constant: it says what to do with *this
 * image*, which is the same request whoever handed the page over.
 */
export type SystemPrompt = string | ((ctx: CaptureContext) => string)

/** Server-side extraction: one schema-constrained multimodal call. */
export interface CaptureExtract {
  schema: GeminiSchema
  systemPrompt: SystemPrompt
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

  /**
   * Do something with the finished result, after the row is written.
   *
   * The generic post-extraction hook BHCS-31 asks for. `refine` transforms an
   * extraction into something stored beside it; this one is for effects that
   * leave the capture pipeline entirely — the worksheet app posting a graded
   * page to the skill graph so a child's mastery moves is the first, and the
   * platform must not learn that mastery exists any more than it has learned
   * that chess does.
   *
   * Deliberately returns nothing. Whatever happens here cannot change the
   * capture, and a failure must not fail it: the page is already stored, the
   * Debrief is already on screen, and losing either because a downstream
   * service was unreachable would be a far worse outcome than a Floor plan
   * that updates late.
   */
  record?(args: RecordArgs<Result>): Promise<void>
}

/** What an app is handed when its `record` hook fires. */
export interface RecordArgs<Result = unknown> {
  /** `captures.id` — stable, and the idempotency key for anything downstream. */
  captureId: string
  /** What the model read, and what the app made of it if it declared `refine`. */
  data: Result
  refined: unknown | null
  /** Who the capture was for, and which task it was of. */
  context: CaptureContext
}

/**
 * How an app colours itself in the picker.
 *
 * Colour is presentation, and presentation of an app is the app's own business
 * — the platform draws whatever it is handed and has no table of kinds to
 * colour. Two values rather than one because the pair has to work together at
 * a distance: `tint` is what a six-year-old aims at, `accent` is the edge and
 * the emphasis that keep it legible against the station's warm white.
 */
export interface CaptureTheme {
  tint: string
  accent: string
}

/**
 * One thing said to the student while they wait, in both languages.
 *
 * Fixed text, not a generated reply: it is chosen and shown entirely at the
 * kiosk, before any reading has happened, so it can say what is *going on* but
 * must never say anything about what is on the page. "I'm looking at your
 * first answer" is true of the pipeline; "nice handwriting" would be a
 * sentence the machine is in no position to have written.
 */
export interface WaitLine {
  en: string
  zh: string
}

/**
 * What an app wants said out loud, per language (BHCS-15).
 *
 * Lines, not one string, and not the rendered screen either. Read-aloud is a
 * second rendering of the same result, and the two media want different things
 * from it: the screen can carry `⭐ You got it 会了` on one pill because the eye
 * takes all three at once, while a voice reading that aloud says a star, then
 * an English clause, then a Chinese one, to a child who asked for exactly one
 * of them. So the app writes the spoken version deliberately, in the order the
 * screen presents it, and the platform never scrapes the DOM for it.
 *
 * Either side may be empty, which means this result has nothing worth saying
 * in that language — the platform then offers no button for it rather than a
 * button that produces silence.
 */
export interface SpokenScript {
  en: readonly string[]
  zh: readonly string[]
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

  /** Which paper this kind arrives on. Drives the crop guide. */
  paper: PaperId

  /** How this app colours its button. Falls back to the platform's neutral. */
  theme?: CaptureTheme

  /** The second line under the spinner while the capture is in flight. */
  waitHint: string

  /**
   * What the app has to say to this particular student while they wait.
   *
   * The platform shows these one after another, as a conversation rather than
   * a status line — twenty seconds of "Saving and reading…" is twenty seconds
   * a child spends deciding the machine has stopped. It is the app's function
   * and not the platform's because what is worth saying about a half-read
   * scoresheet has nothing in common with what is worth saying about a
   * drawing, and the platform is not allowed to know which it is holding.
   *
   * Returns a pool, not a script: the platform picks from it, so two captures
   * in a row do not produce the same wait. Absent means the plain spinner.
   */
  waitChat?: (ctx: CaptureContext) => WaitLine[]

  /** Replaces the branch in the platform's old ResultCard. */
  ResultView: FC<{ result: Result; student: Student }>

  /**
   * This result as speech, for a student who cannot read it (BHCS-15).
   *
   * The split is the same one `waitChat` makes: *what* is said belongs to the
   * app, because only it knows what a quality tier is or which of its fields
   * are prose; *how* it is said — which voice, how fast, and the fact that it
   * only ever happens when a child presses a button — belongs to the platform,
   * because that is true of anything this station says out loud.
   *
   * Absent means no read-aloud offered, which is the honest answer for a
   * result that is a transcription or a stored drawing rather than something
   * written to be read.
   */
  speech?: (result: Result, ctx: CaptureContext) => SpokenScript

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

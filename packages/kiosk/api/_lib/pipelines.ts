/**
 * The capture pipeline — one path, driven by the app's own declaration.
 *
 * There is deliberately no branch on kind here. An app either declares an
 * `extract` step or it does not, and either declares a `refine` step or it does
 * not; those two optionals are the whole variation. What each app extracts, and
 * with which prompt, is the app's business and lives in its own package.
 */

import type { CaptureAppServer, CaptureContext, RecordArgs, SystemPrompt } from '@atrium/schema'
import { visionJson, visionJsonStream } from './gemini'

export interface PipelineOutcome {
  status: 'ok' | 'skipped' | 'failed'
  /** The verbatim extraction. Never rewritten — it is the teacher's audit trail. */
  data: unknown | null
  model: string | null
  ms: number | null
  error: string | null

  /**
   * `refine`'s output, alongside `data` rather than in place of it, with its
   * own status and error: refinement can fail on a perfectly good extraction,
   * and reporting that as an OCR failure would send anyone debugging it to the
   * wrong place entirely.
   */
  refined: unknown | null
  refinedStatus: 'ok' | 'skipped' | 'failed'
  refinedError: string | null
}

/** Nothing extracted and nothing refined — the store-only outcome. */
const NOTHING: PipelineOutcome = {
  status: 'skipped',
  data: null,
  model: null,
  ms: null,
  error: null,
  refined: null,
  refinedStatus: 'skipped',
  refinedError: null,
}

/**
 * A prompt an app wrote once, or one it writes per student (BHCS-14).
 *
 * The platform resolves it and looks no further: which student facts an app
 * consults, and what it does with them, is the app's business — exactly as
 * the prompt's wording already was.
 */
function systemPrompt(prompt: SystemPrompt, ctx: CaptureContext): string {
  return typeof prompt === 'function' ? prompt(ctx) : prompt
}

export async function runPipeline(
  app: CaptureAppServer,
  image: Buffer,
  mimeType: string,
  /** Who the capture is for. Every app is free to ignore it, and two do. */
  ctx: CaptureContext,
  /**
   * Where to send the extraction as it is written, for an app that asked for
   * streaming (BHCS-10). Absent means nobody is watching — a replay from a
   * script, or a client that did not open a stream — and the buffered
   * transport is used, which is also what every app that never opts in gets.
   */
  onPartial?: (partial: unknown) => void,
): Promise<PipelineOutcome> {
  // No extraction declared — the capture is stored and nothing else. This is
  // the store-only path, expressed as an absence rather than a special case.
  if (!app.extract) return NOTHING

  const call = {
    image,
    mimeType,
    systemPrompt: systemPrompt(app.extract.systemPrompt, ctx),
    userPrompt: app.extract.userPrompt,
    schema: app.extract.schema,
  }

  let data: unknown
  let model: string
  let ms: number
  try {
    // Still no branch on kind: an app declares whether its extraction is worth
    // watching arrive, and the platform picks the transport that says so. Both
    // transports resolve to the same object, so everything below is shared.
    ;({ data, model, ms } =
      app.extract.stream && onPartial
        ? await visionJsonStream({ ...call, onPartial })
        : await visionJson(call))
  } catch (err) {
    // A failed pipeline must never lose the image — capture.ts has already
    // persisted it to Drive by this point, and the row is written either way.
    return { ...NOTHING, status: 'failed', error: (err as Error).message }
  }

  const extracted = { ...NOTHING, status: 'ok' as const, data, model, ms }

  if (!app.refine) return extracted

  try {
    return { ...extracted, refined: await app.refine(data), refinedStatus: 'ok' }
  } catch (err) {
    // Refinement is post-processing over an extraction that already succeeded.
    // Losing the raw transcription because a validator threw would be the worse
    // outcome by far, so the capture stays 'ok' and the failure is recorded
    // beside the data rather than instead of it.
    return { ...extracted, refinedStatus: 'failed', refinedError: (err as Error).message }
  }
}

/**
 * Let an app act on a finished capture, after the row exists (BHCS-31).
 *
 * Separate from `runPipeline` because it runs at a different moment: the
 * pipeline produces what gets written, this happens once the writing is done
 * and there is a `captureId` to be idempotent against.
 *
 * Never throws. The image is stored, the row is written and the Debrief is on
 * screen by the time this runs; letting an unreachable downstream service turn
 * a successful capture into a failed one would trade a Floor plan that updates
 * late for a child's work that disappears. The failure is logged and the
 * capture stands.
 *
 * The platform still knows nothing about what any app does in here.
 */
export async function runRecord(
  app: CaptureAppServer,
  args: RecordArgs,
): Promise<{ ok: boolean; error?: string }> {
  if (!app.record) return { ok: true }
  try {
    await app.record(args)
    return { ok: true }
  } catch (err) {
    const error = (err as Error).message
    console.error(`[capture] ${app.id} record hook failed for ${args.captureId}: ${error}`)
    return { ok: false, error }
  }
}

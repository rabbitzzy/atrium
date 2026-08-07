/**
 * The capture pipeline — one path, driven by the app's own declaration.
 *
 * There is deliberately no branch on kind here. An app either declares an
 * `extract` step or it does not, and either declares a `refine` step or it does
 * not; those two optionals are the whole variation. What each app extracts, and
 * with which prompt, is the app's business and lives in its own package.
 */

import type { CaptureAppServer } from '@atrium/schema'
import { visionJson } from './gemini'

export interface PipelineOutcome {
  status: 'ok' | 'skipped' | 'failed'
  /** The verbatim extraction. Never rewritten — it is the teacher's audit trail. */
  data: unknown | null
  /** `refine`'s output, alongside `data` rather than in place of it. */
  refined: unknown | null
  model: string | null
  ms: number | null
  error: string | null
}

export async function runPipeline(
  app: CaptureAppServer,
  image: Buffer,
  mimeType: string,
): Promise<PipelineOutcome> {
  // No extraction declared — the capture is stored and nothing else. This is
  // the store-only path, expressed as an absence rather than a special case.
  if (!app.extract) {
    return { status: 'skipped', data: null, refined: null, model: null, ms: null, error: null }
  }

  let data: unknown
  let model: string
  let ms: number
  try {
    ;({ data, model, ms } = await visionJson({
      image,
      mimeType,
      systemPrompt: app.extract.systemPrompt,
      userPrompt: app.extract.userPrompt,
      schema: app.extract.schema,
    }))
  } catch (err) {
    // A failed pipeline must never lose the image — capture.ts has already
    // persisted it to Drive by this point, and the row is written either way.
    return {
      status: 'failed',
      data: null,
      refined: null,
      model: null,
      ms: null,
      error: (err as Error).message,
    }
  }

  if (!app.refine) return { status: 'ok', data, refined: null, model, ms, error: null }

  try {
    return { status: 'ok', data, refined: await app.refine(data), model, ms, error: null }
  } catch (err) {
    // Refinement is post-processing over an extraction that already succeeded.
    // Losing the raw transcription because a validator threw would be the worse
    // outcome by far, so the status stays 'ok' and the failure is reported
    // beside the data rather than instead of it.
    return { status: 'ok', data, refined: null, model, ms, error: `refine failed: ${(err as Error).message}` }
  }
}

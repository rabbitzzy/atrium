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

export async function runPipeline(
  app: CaptureAppServer,
  image: Buffer,
  mimeType: string,
): Promise<PipelineOutcome> {
  // No extraction declared — the capture is stored and nothing else. This is
  // the store-only path, expressed as an absence rather than a special case.
  if (!app.extract) return NOTHING

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

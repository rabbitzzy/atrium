/**
 * The capture pipeline — one path, driven by the app's own declaration.
 *
 * There is deliberately no branch on kind here. An app either declares an
 * `extract` step or it does not, and either declares a `refine` step or it does
 * not; those two optionals are the whole variation. What each app extracts, and
 * with which prompt, is the app's business and lives in its own package.
 */

import type {
  CaptureAppServer,
  CaptureCloseUp,
  CaptureContext,
  RecordArgs,
  SystemPrompt,
} from '@atrium/schema'
import { cropJpeg, decodeJpeg, isJpeg } from './crop.js'
import { visionJson, visionJsonStream } from './gemini.js'
import { inParallel } from './pool.js'

/**
 * How many close-up calls are in flight at once (BHCS-107).
 *
 * A page of nine diagrams is nine calls, and running them one after another
 * would put the result well past the thirty seconds a child will wait.
 *
 * Twelve, because the rounds are what is felt: a nine-puzzle sheet at a cap of
 * eight waits for a whole second round to read its ninth board, which measured
 * as 44 seconds against 30 for the same page read in one. Puzzle sheets come
 * six, nine and twelve to a page, so this reads all of the common ones in a
 * single round — and still bounds a page that turns out to hold fifty.
 */
const CLOSE_UP_CONCURRENCY = 12

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

/**
 * The second, closer pass: crop each region the app pointed at and read it.
 *
 * Never throws and never fails the capture. A region whose call fails comes
 * back as `null` and the app's `merge` decides what that means — one
 * unreadable diagram on a page of nine must not cost the other eight.
 *
 * The platform knows only that these are regions of a photograph. What is
 * inside one, and what the readings mean, stays entirely with the app.
 */
async function runCloseUp(
  closeUp: CaptureCloseUp,
  raw: unknown,
  image: Buffer,
  mimeType: string,
  ctx: CaptureContext,
): Promise<unknown> {
  const regions = closeUp.regions(raw)
  if (regions.length === 0) return raw

  // Only JPEG can be cropped, which is what the kiosk camera produces. Anything
  // else keeps the single-pass extraction rather than losing it.
  if (!isJpeg(mimeType)) {
    console.warn(`[capture] close-up skipped: ${mimeType} cannot be cropped`)
    return raw
  }

  // Decoded once for the whole page. Decoding is the expensive half.
  const decoded = decodeJpeg(image)
  const prompt = systemPrompt(closeUp.systemPrompt, ctx)

  const readings = await inParallel(
    regions,
    CLOSE_UP_CONCURRENCY,
    async (region) => {
      const crop = cropJpeg(decoded, region.box)
      if (!crop) return null
      const { data } = await visionJson({
        image: crop,
        mimeType: 'image/jpeg',
        systemPrompt: prompt,
        userPrompt: region.note ? `${closeUp.userPrompt}\n\n${region.note}` : closeUp.userPrompt,
        schema: closeUp.schema,
        ...(closeUp.model ? { model: closeUp.model } : {}),
      })
      return data
    },
    // One region failing is a gap in the page, not a failed capture.
    (err, i) =>
      console.warn(
        `[capture] close-up ${i + 1}/${regions.length} failed: ${(err as Error).message}`,
      ),
  )

  return closeUp.merge(raw, readings)
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
    ...(app.extract.model ? { model: app.extract.model } : {}),
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

  // A closer look at what the first pass found, if the app asked for one. The
  // result is still the extraction — `refine` below cannot tell how many calls
  // went into assembling it, which is what keeps `refine` pure and replayable.
  if (app.extract.closeUp) {
    try {
      data = await runCloseUp(app.extract.closeUp, data, image, mimeType, ctx)
    } catch (err) {
      // The first pass succeeded and is worth keeping on its own. Losing a
      // located page because the closer look threw would be the worse trade.
      console.warn(`[capture] close-up pass failed: ${(err as Error).message}`)
    }
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

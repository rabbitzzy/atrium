/**
 * POST /api/capture — the ingestion endpoint.
 *
 * Order of operations matters and is deliberate:
 *   1. Write the image to the storage backend
 *   2. Insert the row (status: pending)
 *   3. Run the pipeline
 *   4. Update the row with the result
 *
 * Persisting pixels first means a model outage, a schema drift, or a bad
 * prompt can never cost us a capture — the student has already walked away
 * with their paper. A row stuck at 'pending' or 'failed' is recoverable; a
 * lost image is not.
 *
 * Two ways to answer, one ingestion. An app that asked for streaming gets the
 * same four steps reported as they happen (BHCS-10); every other app gets the
 * finished object. `ingest` below does not know which it is serving — the
 * difference is entirely in this file's last twenty lines.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { CaptureAppServer, CaptureResponse, Student } from '@atrium/schema'
import { atrium } from './_lib/db'
import { storeCapture } from './_lib/storage'
import { runPipeline } from './_lib/pipelines'
import { APP_IDS, appById } from './_lib/registry'
import { openSse } from './_lib/sse'

interface CaptureBody {
  imageBase64?: string
  mimeType?: string
  studentId?: string
  studentName?: string
  /** Unknown, not `number`: it arrives over the wire and most rows have none. */
  studentGrade?: unknown
  kind?: string
  crop?: unknown
}

/**
 * Grade as a hint, exactly as `_lib/bhcs.ts` describes it — and therefore not
 * validated the way the fields above are.
 *
 * A missing or unparseable grade drops to null and the capture proceeds. It is
 * never a 400: the student has already handed over the page, nothing in the
 * pipeline depends on this value, and most of the roster has no grade at all,
 * so refusing a capture over it would gate on precisely the field that must
 * never gate.
 *
 * Bounded at 12 because the only consumer is a wording level for a K-5 hub;
 * anything outside that is a client bug and a null is the honest reading of it.
 */
function usableGrade(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  return raw >= 0 && raw <= 12 ? Math.floor(raw) : null
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** Drive filenames are browsed by humans; keep them boring and sortable. */
function safeFilename(studentName: string, kind: string, mimeType: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const slug = studentName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown'
  return `${stamp}_${slug}_${kind}.${EXTENSIONS[mimeType] ?? 'jpg'}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = (req.body ?? {}) as CaptureBody
  const { imageBase64, studentId, studentName } = body
  const mimeType = body.mimeType ?? 'image/jpeg'
  const kind = body.kind

  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' })
  if (!studentId || !studentName) {
    return res.status(400).json({ error: 'studentId and studentName are required' })
  }
  const app = kind ? appById(kind) : undefined
  if (!app) {
    return res.status(400).json({ error: `kind must be one of: ${APP_IDS.join(', ')}` })
  }
  if (!EXTENSIONS[mimeType]) {
    return res.status(400).json({ error: `Unsupported mimeType: ${mimeType}` })
  }

  const image = Buffer.from(imageBase64, 'base64')
  if (image.length === 0) return res.status(400).json({ error: 'Empty image' })

  const student: Student = { id: studentId, name: studentName, grade: usableGrade(body.studentGrade) }
  const args: IngestArgs = { app, image, mimeType, student, crop: body.crop }

  // Every rejection above is a bad request with nothing stored, so it is a
  // status code. Past this point the response has begun and failures are
  // reported inside it — which is why validation all happens first.
  if (!app.extract?.stream) {
    try {
      return res.status(200).json(await ingest(args))
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message })
    }
  }

  const sse = openSse(res)
  try {
    sse.send('done', await ingest(args, {
      onStored: (stored) => sse.send('stored', stored),
      onPartial: (partial) => sse.send('partial', partial),
    }))
  } catch (err) {
    // A 500 is no longer available — the headers left with the first byte —
    // so the failure travels as an event and the kiosk reads it as one.
    sse.send('error', { error: (err as Error).message })
  }
  return sse.close()
}

interface IngestArgs {
  app: CaptureAppServer
  image: Buffer
  mimeType: string
  /**
   * Carried whole rather than as loose id/name fields, because it is also the
   * `CaptureContext` the app's prompt is addressed to. Splitting it would mean
   * reassembling it one line before the pipeline call.
   */
  student: Student
  crop: unknown
}

/**
 * Store, index, interpret, record. The whole capture, with no opinion about
 * who is watching: the callbacks are optional and the return value is the same
 * either way.
 */
async function ingest(
  { app, image, mimeType, student, crop }: IngestArgs,
  watch?: {
    onStored: (stored: Pick<CaptureResponse, 'captureId' | 'fileUrl' | 'storageBackend'>) => void
    onPartial: (partial: unknown) => void
  },
): Promise<CaptureResponse> {
  const db = atrium()

  // 1. Pixels first, wherever CAPTURE_STORAGE points.
  const file = await storeCapture({
    bytes: image,
    filename: safeFilename(student.name, app.id, mimeType),
    mimeType,
    folder: app.id,
  })

  // 2. Index it before spending time in the model.
  const { data: row, error: insertError } = await db
    .from('captures')
    .insert({
      student_id: student.id,
      student_name: student.name,
      kind: app.id,
      storage_backend: file.backend,
      storage_id: file.id,
      storage_url: file.url,
      mime_type: mimeType,
      bytes: image.length,
      crop_json: crop ?? null,
      ocr_status: 'pending',
    })
    .select('id')
    .single()

  if (insertError) throw new Error(`Insert failed: ${insertError.message}`)
  const captureId = row.id as string

  // Announced here rather than at the end, because this is the moment the
  // guarantee at the top of this file starts holding: from now on, whatever
  // happens to the model call, the page is not lost.
  watch?.onStored({ captureId, fileUrl: file.url, storageBackend: file.backend })

  // 3. Interpret. Which model call this is, if any, is the app's business —
  //    including whether knowing who the student is changes how it asks.
  const outcome = await runPipeline(app, image, mimeType, { student }, watch?.onPartial)

  // 4. Record the result. If this update fails the image and row still
  //    exist, so the capture is replayable from the 'pending' index.
  //
  //    The two halves are written side by side and never merged:
  //    `ocr_json` is what the model read, `refined_json` is what the app
  //    made of it. Overwriting the first with the second would throw away
  //    the only record of what was actually on the paper.
  const { error: updateError } = await db
    .from('captures')
    .update({
      ocr_json: outcome.data,
      ocr_status: outcome.status,
      ocr_error: outcome.error,
      ocr_model: outcome.model,
      ocr_ms: outcome.ms,
      refined_json: outcome.refined,
      refined_status: outcome.refinedStatus,
      refined_error: outcome.refinedError,
    })
    .eq('id', captureId)

  if (updateError) throw new Error(`Update failed: ${updateError.message}`)

  return {
    captureId,
    fileUrl: file.url,
    storageBackend: file.backend,
    kind: app.id,
    ocrStatus: outcome.status,
    ocrError: outcome.error,
    ocrMs: outcome.ms,
    ocr: outcome.refined ?? outcome.data,
  }
}

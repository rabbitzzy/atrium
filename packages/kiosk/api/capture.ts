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
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { CaptureResponse } from '@atrium/schema'
import { atrium } from './_lib/db'
import { storeCapture } from './_lib/storage'
import { runPipeline } from './_lib/pipelines'
import { APP_IDS, appById } from './_lib/registry'

interface CaptureBody {
  imageBase64?: string
  mimeType?: string
  studentId?: string
  studentName?: string
  kind?: string
  crop?: unknown
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

  const db = atrium()

  try {
    // 1. Pixels first, wherever CAPTURE_STORAGE points.
    const file = await storeCapture({
      bytes: image,
      filename: safeFilename(studentName, app.id, mimeType),
      mimeType,
      folder: app.id,
    })

    // 2. Index it before spending time in the model.
    const { data: row, error: insertError } = await db
      .from('captures')
      .insert({
        student_id: studentId,
        student_name: studentName,
        kind: app.id,
        storage_backend: file.backend,
        storage_id: file.id,
        storage_url: file.url,
        mime_type: mimeType,
        bytes: image.length,
        crop_json: body.crop ?? null,
        ocr_status: 'pending',
      })
      .select('id')
      .single()

    if (insertError) throw new Error(`Insert failed: ${insertError.message}`)
    const captureId = row.id as string

    // 3. Interpret. Which model call this is, if any, is the app's business.
    const outcome = await runPipeline(app, image, mimeType)

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

    const response: CaptureResponse = {
      captureId,
      fileUrl: file.url,
      storageBackend: file.backend,
      kind: app.id,
      ocrStatus: outcome.status,
      ocrError: outcome.error,
      ocrMs: outcome.ms,
      ocr: outcome.refined ?? outcome.data,
    }
    return res.status(200).json(response)
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message })
  }
}

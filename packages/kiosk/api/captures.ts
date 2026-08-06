/**
 * GET /api/captures — browse what's been ingested.
 *
 * Admin/exploration surface: no auth, per the current phase. Filterable by
 * student and kind so you can answer "what has this child submitted" and
 * "show me every chess scoresheet" without opening Drive.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { atrium } from './_lib/db'
import { CAPTURE_KINDS, type CaptureKind } from './_lib/pipelines'

const MAX_LIMIT = 200

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const studentId = typeof req.query['studentId'] === 'string' ? req.query['studentId'] : undefined
  const kind = typeof req.query['kind'] === 'string' ? req.query['kind'] : undefined
  const limit = Math.min(Number(req.query['limit']) || 50, MAX_LIMIT)

  if (kind && !CAPTURE_KINDS.includes(kind as CaptureKind)) {
    return res.status(400).json({ error: `kind must be one of: ${CAPTURE_KINDS.join(', ')}` })
  }

  try {
    let query = atrium()
      .from('captures')
      .select('id, student_id, student_name, kind, storage_backend, storage_url, ocr_json, ocr_status, ocr_error, ocr_ms, captured_at')
      .order('captured_at', { ascending: false })
      .limit(limit)

    if (studentId) query = query.eq('student_id', studentId)
    if (kind) query = query.eq('kind', kind)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    return res.status(200).json({ captures: data ?? [] })
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message })
  }
}

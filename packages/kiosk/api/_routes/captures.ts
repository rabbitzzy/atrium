/**
 * GET /api/captures — browse what's been ingested.
 *
 * Admin/exploration surface: no auth, per the current phase. Filterable by
 * student and kind so you can answer "what has this child submitted" and
 * "show me everything one app has handled" without opening Drive.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from '../_lib/admin'
import { atrium } from '../_lib/db'
import { APP_IDS } from '../_lib/registry'

const MAX_LIMIT = 200

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!requireAdmin(req, res)) return

  const studentId = typeof req.query['studentId'] === 'string' ? req.query['studentId'] : undefined
  const kind = typeof req.query['kind'] === 'string' ? req.query['kind'] : undefined
  const limit = Math.min(Number(req.query['limit']) || 50, MAX_LIMIT)

  if (kind && !APP_IDS.includes(kind)) {
    return res.status(400).json({ error: `kind must be one of: ${APP_IDS.join(', ')}` })
  }

  try {
    let query = atrium()
      .from('captures')
      .select(
        'id, student_id, student_name, kind, storage_backend, storage_url, crop_json, ocr_json, ocr_status, ocr_error, ocr_ms, refined_json, refined_status, refined_error, captured_at',
      )
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

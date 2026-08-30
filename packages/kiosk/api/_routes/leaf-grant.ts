/**
 * POST /api/leaf-grant?studentId=… — a teacher grants a Leaf.
 *
 * The kiosk's zero-balance state tells a child to ask a teacher. This is the
 * teacher's side of that sentence, and until it existed the copy was writing a
 * cheque the interface could not cash.
 *
 * Admin-gated, and it writes — the weakness BHCS-90 tracks applies here more
 * than anywhere: a shared token typed at a station is what currently stands
 * between a child and minting their own paper.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from '../_lib/admin'
import { relay } from '../_lib/relay'

const SKILL_GRAPH_URL = process.env['SKILL_GRAPH_URL'] ?? 'http://127.0.0.1:3001'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAdmin(req, res)) return
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }
  const studentId = typeof req.query['studentId'] === 'string' ? req.query['studentId'] : ''
  if (!studentId) return res.status(400).json({ error: 'studentId is required' })

  return relay(res, `${SKILL_GRAPH_URL}/students/${encodeURIComponent(studentId)}/leaves/grant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req.body ?? {}),
  })
}

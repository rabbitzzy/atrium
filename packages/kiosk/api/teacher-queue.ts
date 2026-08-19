/**
 * GET  /api/teacher-queue          — the review queue
 * POST /api/teacher-queue?id=…     — record that an item was opened
 *
 * A proxy, like `floor-plan.ts` and `leaves.ts`. The queue is assembled by
 * skill-graph, which owns the ordering rule and the seven-day window; a second
 * opinion about which grades need a human would be a second product.
 *
 * Admin-gated, and that gate is the weak part. BHCS-42 put this surface in the
 * kiosk bundle, which runs on a shared machine in a room full of children, and
 * noted the consequence: a token typed at a station is not an access control.
 * Portal-issued auth has to replace it before real student work sits behind it.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from './_lib/admin'
import { relay } from './_lib/relay'

const SKILL_GRAPH_URL = process.env['SKILL_GRAPH_URL'] ?? 'http://127.0.0.1:3001'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAdmin(req, res)) return

  if (req.method === 'POST') {
    const id = typeof req.query['id'] === 'string' ? req.query['id'] : ''
    if (!id) return res.status(400).json({ error: 'id is required' })
    return relay(res, `${SKILL_GRAPH_URL}/teacher/queue/${encodeURIComponent(id)}/viewed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.body ?? {}),
    })
  }

  return relay(res, `${SKILL_GRAPH_URL}/teacher/queue`, { headers: { accept: 'application/json' } })
}

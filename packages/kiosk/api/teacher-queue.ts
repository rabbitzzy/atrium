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

const SKILL_GRAPH_URL = process.env['SKILL_GRAPH_URL'] ?? 'http://127.0.0.1:3001'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAdmin(req, res)) return

  try {
    if (req.method === 'POST') {
      const id = typeof req.query['id'] === 'string' ? req.query['id'] : ''
      if (!id) return res.status(400).json({ error: 'id is required' })
      const up = await fetch(`${SKILL_GRAPH_URL}/teacher/queue/${encodeURIComponent(id)}/viewed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req.body ?? {}),
      })
      return res.status(up.status).json(await up.json())
    }

    const up = await fetch(`${SKILL_GRAPH_URL}/teacher/queue`, {
      headers: { accept: 'application/json' },
    })
    if (!up.ok) return res.status(502).json({ error: `skill-graph answered ${up.status}` })
    return res.status(200).json(await up.json())
  } catch {
    return res.status(503).json({ error: 'skill-graph is unreachable' })
  }
}

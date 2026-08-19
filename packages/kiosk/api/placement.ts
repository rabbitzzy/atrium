/**
 * POST /api/placement — a teacher says where a child starts.
 *
 * BHCS-32 decided placement is teacher-entered rather than a diagnostic Card,
 * and shipped the endpoint without anywhere to enter it. Until now the only way
 * to place a student was to POST JSON by hand, which is not a five-minute form
 * and is certainly not something to do at the side of a child's first session.
 *
 * A proxy, like the other three. The derivation — which prior each Room gets
 * from a grade band, and the rule that a Room with real attempts is never
 * overwritten — belongs to skill-graph, and a second copy of it here would be a
 * second opinion about a child's starting point.
 *
 * Admin-gated, with the same weakness BHCS-90 tracks: a shared token is not an
 * access control, and this one writes rather than reads.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from './_lib/admin'

const SKILL_GRAPH_URL = process.env['SKILL_GRAPH_URL'] ?? 'http://127.0.0.1:3001'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAdmin(req, res)) return
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const body = (req.body ?? {}) as { studentId?: string }
  if (!body.studentId) return res.status(400).json({ error: 'studentId is required' })

  try {
    const up = await fetch(
      `${SKILL_GRAPH_URL}/students/${encodeURIComponent(body.studentId)}/placement`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req.body),
      },
    )
    return res.status(up.status).json(await up.json())
  } catch {
    return res.status(503).json({ error: 'skill-graph is unreachable' })
  }
}

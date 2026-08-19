/**
 * GET /api/leaves?studentId=… — what this child may print.
 *
 * A proxy, for the same reason `floor-plan.ts` is one: the Leaf ledger lives
 * behind `skill-graph`, which owns the atomicity that keeps a balance and its
 * events from disagreeing (BHCS-38). Reading `student_print_state` directly
 * from here would put a second opinion about the economy in the layer that is
 * meant to hold none.
 *
 * A station that cannot reach the service reports nothing rather than zero.
 * Zero is a real state with a real meaning — "turn in a Card" — and showing it
 * because a network call failed would tell a child something false about their
 * own work.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

const SKILL_GRAPH_URL = process.env['SKILL_GRAPH_URL'] ?? 'http://127.0.0.1:3001'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const studentId = typeof req.query['studentId'] === 'string' ? req.query['studentId'] : ''
  if (!studentId) return res.status(400).json({ error: 'studentId is required' })

  try {
    const upstream = await fetch(
      `${SKILL_GRAPH_URL}/students/${encodeURIComponent(studentId)}/leaves`,
      { headers: { accept: 'application/json' } },
    )
    if (!upstream.ok) return res.status(502).json({ error: `skill-graph answered ${upstream.status}` })
    return res.status(200).json(await upstream.json())
  } catch {
    return res.status(503).json({ error: 'skill-graph is unreachable' })
  }
}

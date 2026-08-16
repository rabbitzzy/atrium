/**
 * GET /api/floor-plan?studentId=… — one student's Floor plan, for the student.
 *
 * A proxy, not a query. Every other route in this folder reads Supabase
 * directly, and this one deliberately does not: mastery lives behind
 * `skill-graph`, which owns the BKT parameters, the confidence band and the
 * rule that no history means the Room's prior rather than zero. Reaching past
 * it into `student_kc_state` would put a second, quietly different version of
 * those rules in the platform — and the platform is the one layer that is meant
 * to hold no domain knowledge at all.
 *
 * So the kiosk asks the service, and the numbers on the child's screen are the
 * same numbers the teacher's view and the parent portal will get, because all
 * three read one endpoint.
 *
 * `studentId` is required and applied server-side, exactly as in `my-work.ts`:
 * a child at the station can only ever ask for their own Floor plan.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

const SKILL_GRAPH_URL = process.env['SKILL_GRAPH_URL'] ?? 'http://127.0.0.1:3001'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const studentId = typeof req.query['studentId'] === 'string' ? req.query['studentId'] : ''
  if (!studentId) return res.status(400).json({ error: 'studentId is required' })

  // Leaves only, and the drawable strand axes with them. The thirty Rooms come
  // along because a child who taps a spoke wants to know which part of it moved.
  const url = `${SKILL_GRAPH_URL}/students/${encodeURIComponent(studentId)}/radar?depth=2&spokes=1`

  try {
    const upstream = await fetch(url, { headers: { accept: 'application/json' } })
    if (!upstream.ok) {
      return res
        .status(502)
        .json({ error: `skill-graph answered ${upstream.status}`, studentId })
    }
    const body = await upstream.json()
    return res.status(200).json(body)
  } catch {
    // The service being down is an ordinary condition at a kiosk, not an
    // exception: the station keeps working, the progress screen says it cannot
    // reach the numbers right now, and no child sees a stack trace.
    return res.status(503).json({ error: 'skill-graph is unreachable', studentId })
  }
}

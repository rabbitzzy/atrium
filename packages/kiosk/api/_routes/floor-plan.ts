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
import { relay } from '../_lib/relay.js'
import { callSkillGraph } from '../_lib/skill-graph.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const studentId = typeof req.query['studentId'] === 'string' ? req.query['studentId'] : ''
  if (!studentId) return res.status(400).json({ error: 'studentId is required' })

  // Leaves only, and the drawable strand axes with them. The thirty Rooms come
  // along because a child who taps a spoke wants to know which part of it moved.
  //
  // `edges=1` is for the map view (BHCS-88), which draws the same thirty Rooms
  // as a building rather than a polygon. Asked for unconditionally because the
  // two views share one fetch — a child toggling between them should not wait
  // twice, and the wiring is a couple of kilobytes.
  const path = `/students/${encodeURIComponent(studentId)}/radar?depth=2&spokes=1&edges=1`

  // A station that cannot reach the service keeps working; the progress screen
  // says it cannot read the numbers right now, and no child sees a stack trace.
  return relay(res, () => callSkillGraph(path, { headers: { accept: 'application/json' } }))
}

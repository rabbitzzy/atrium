/**
 * GET /api/student-state?studentId=… — everything a teacher wants about one child.
 *
 * Three calls to skill-graph collapsed into one, because they answer one
 * question between them and a teacher checking on a student should not wait for
 * three round trips to find out whether a Card did anything.
 *
 *   the Floor plan   — where they are now, per strand, with its confidence band
 *   the attempts     — how they got there, before and after, per question
 *   the Leaves       — whether they can print, which is the other thing a
 *                      teacher is asked about at a station
 *
 * Admin-gated like the rest of the teacher surface, with the weakness BHCS-90
 * tracks.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from '../_lib/admin.js'
import { callSkillGraph, skillGraphWhere } from '../_lib/skill-graph.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAdmin(req, res)) return

  const studentId = typeof req.query['studentId'] === 'string' ? req.query['studentId'] : ''
  if (!studentId) return res.status(400).json({ error: 'studentId is required' })

  const id = encodeURIComponent(studentId)
  try {
    const [radar, attempts, leaves] = await Promise.all([
      callSkillGraph(`/students/${id}/radar?depth=2&spokes=1`).then((r) => r.json()),
      callSkillGraph(`/students/${id}/attempts`).then((r) => r.json()),
      callSkillGraph(`/students/${id}/leaves`).then((r) => r.json()),
    ])
    return res.status(200).json({ studentId, radar, attempts, leaves })
  } catch {
    return res.status(503).json({
      error: 'skill_graph_unreachable',
      detail: `no answer from ${skillGraphWhere()}`,
    })
  }
}

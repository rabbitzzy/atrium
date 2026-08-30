/**
 * DELETE /api/simulated?studentId=… — take a rehearsal back out.
 *
 * Admin-gated, because it deletes. Only ever removes rows marked simulated;
 * there is no parameter that widens it to real work, deliberately.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from '../_lib/admin'
import { relay } from '../_lib/relay'
import { callSkillGraph } from '../_lib/skill-graph'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAdmin(req, res)) return
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE')
    return res.status(405).json({ error: 'method_not_allowed' })
  }
  const studentId = typeof req.query['studentId'] === 'string' ? req.query['studentId'] : ''
  if (!studentId) return res.status(400).json({ error: 'studentId is required' })

  return relay(res, () =>
    callSkillGraph(`/students/${encodeURIComponent(studentId)}/simulated`, { method: 'DELETE' }),
  )
}

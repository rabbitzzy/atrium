/**
 * GET /api/students — the kiosk roster, live from the BHCS portal.
 *
 * The portal is the single source of truth for student profiles (CLAUDE.md);
 * Atrium never stores its own copy. Read-only by construction: the portal's
 * API exposes no way for the kiosk to alter a student record.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { listActiveStudents } from '../_lib/bhcs'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const students = await listActiveStudents()

    // Roster changes rarely; a short cache keeps the picker instant across the
    // rapid check-in/check-out cycle without going stale for a whole session.
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    return res.status(200).json({ students })
  } catch (err) {
    // 502, not 500: when this fails it is the portal that is unreachable, not
    // the kiosk that is broken, and the two want different responses from us.
    return res.status(502).json({ error: (err as Error).message })
  }
}

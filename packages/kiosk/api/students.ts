/**
 * GET /api/students — the kiosk roster, live from the BHCS portal.
 *
 * The portal is the single source of truth for student identity (CLAUDE.md);
 * Atrium never stores its own copy. Read-only by construction.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { bhcs } from './_lib/db'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { data, error } = await bhcs()
      .from('students')
      .select('id, first_name, last_name')
      .eq('active', true)
      .order('first_name')

    if (error) throw new Error(error.message)

    const students = (data ?? []).map((s) => ({
      id: s.id as string,
      name: `${s.first_name} ${s.last_name}`.trim(),
    }))

    // Roster changes rarely; a short cache keeps the picker instant across the
    // rapid check-in/check-out cycle without going stale for a whole session.
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    return res.status(200).json({ students })
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message })
  }
}

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
import { atrium, rows } from './_lib/db'

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

  /*
   * The join happens here, not in skill-graph.
   *
   * A queue row carries a `capture_id`; the image and the child's name live on
   * the `captures` row it points at, and `captures` belongs to the platform.
   * skill-graph reaching into it would give the service that owns mastery an
   * opinion about storage — so the side that owns the table does the lookup,
   * which is this one.
   *
   * Without it the queue renders a UUID where a name should be and no scan at
   * all, which is most of what a teacher came to look at.
   */
  let upstream: Response
  try {
    upstream = await fetch(`${SKILL_GRAPH_URL}/teacher/queue`, { headers: { accept: 'application/json' } })
  } catch {
    return res.status(503).json({
      error: 'skill_graph_unreachable',
      detail: `nothing is listening at ${new URL(SKILL_GRAPH_URL).origin} — is it running?`,
    })
  }
  if (!upstream.ok) {
    return res.status(upstream.status).json({ error: 'skill_graph_error', detail: await upstream.text() })
  }

  const queue = (await upstream.json()) as {
    items: Array<{ captureId: string | null; scanUrl: string | null; studentId: string | null }>
  }

  const captureIds = queue.items.map((i) => i.captureId).filter((id): id is string => !!id)
  if (captureIds.length) {
    const { data } = await atrium()
      .from('captures')
      .select('id, storage_url, student_name')
      .in('id', captureIds)
    type CaptureRow = { id: string; storage_url: string; student_name: string }
    const byId = new Map(rows<CaptureRow>(data).map((c) => [c.id, c]))
    for (const item of queue.items) {
      const cap = item.captureId ? byId.get(item.captureId) : undefined
      if (!cap) continue
      item.scanUrl = item.scanUrl ?? cap.storage_url
      ;(item as { studentName?: string }).studentName = cap.student_name
    }
  }

  return res.status(200).json(queue)
}

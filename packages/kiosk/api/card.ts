/**
 * POST /api/card — the child asks for work, and paper comes out.
 *
 * The last missing edge of the flywheel. Everything on either side of this has
 * worked for a while and nothing joined them: the planner knows what a student
 * should do next, `worksheet-print` turns that into a PDF, the print agent puts
 * a PDF on paper, and no code path ran the three in order. A child at the
 * station could scan work but never receive any.
 *
 * ── The order is the design ──
 *
 * 1. Is the printer able to print at all?
 * 2. Generate — which picks the Room, writes the problems, registers the task
 *    and **spends the Leaf**.
 * 3. Print.
 *
 * Step 1 exists because of what step 2 costs. Generating is where the Leaf goes
 * (BHCS-38 takes it once the PDF exists, the last moment everything observable
 * has succeeded), and there is no refund path — BHCS-67 established that a
 * failure is now *detectable*, but nothing yet acts on one, and the recovery is
 * a teacher granting a replacement.
 *
 * So the cheapest thing this can do for a child is refuse early. An empty tray
 * is the most likely failure in a school, it is knowable in one call before
 * anything is spent, and a Leaf lost to it would be indistinguishable to a
 * seven-year-old from the machine eating their work.
 *
 * Held jobs are supported so this can be exercised without spending paper.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'node:crypto'

const WORKSHEET_URL = process.env['WORKSHEET_PRINT_URL'] ?? 'http://127.0.0.1:3002'
const PRINT_AGENT_URL = process.env['PRINT_AGENT_URL'] ?? 'http://127.0.0.1:3003'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const body = (req.body ?? {}) as { studentId?: string; hold?: boolean }
  const studentId = body.studentId
  if (!studentId) return res.status(400).json({ error: 'studentId is required' })

  // 1. The tray, before the Leaf.
  try {
    const health = await fetch(`${PRINT_AGENT_URL}/health`)
    const h = (await health.json()) as { ready?: boolean; printer?: string | null }
    if (!h.ready) {
      return res.status(503).json({
        error: 'printer_not_ready',
        printer: h.printer ?? null,
        spentLeaf: false,
      })
    }
  } catch {
    return res.status(503).json({ error: 'print_agent_unreachable', spentLeaf: false })
  }

  // 2. Generate. This is where a Leaf goes.
  const taskId = randomUUID()
  let pdf: Buffer
  let leavesLeft: number | null = null
  let rooms: string | null = null
  try {
    const gen = await fetch(`${WORKSHEET_URL}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ studentId, taskId }),
    })

    if (gen.status === 402) {
      const b = (await gen.json()) as { balance?: number }
      // Not an error and not the child's fault; the kiosk renders this as
      // "turn in your Card and you'll earn one", never as a refusal.
      return res.status(402).json({ error: 'insufficient_leaves', balance: b.balance ?? 0, spentLeaf: false })
    }
    if (gen.status === 409) {
      const b = (await gen.json()) as { detail?: string }
      return res.status(409).json({ error: 'no_room_to_assign', detail: b.detail ?? '', spentLeaf: false })
    }
    if (!gen.ok) {
      const b = await gen.text()
      return res.status(502).json({ error: 'generate_failed', detail: b.slice(0, 200), spentLeaf: false })
    }

    leavesLeft = Number(gen.headers.get('x-atrium-leaves') ?? '0')
    rooms = gen.headers.get('x-atrium-rooms')
    pdf = Buffer.from(await gen.arrayBuffer())
  } catch {
    return res.status(503).json({ error: 'worksheet_service_unreachable', spentLeaf: false })
  }

  // 3. Print. Past this point a Leaf has been spent, so every failure says so —
  //    the kiosk has to tell a teacher rather than quietly asking the child to
  //    try again, which would cost them a second Leaf for the same Card.
  try {
    const query = new URLSearchParams({ title: `Atrium Card ${taskId.slice(0, 8)}` })
    if (body.hold) query.set('hold', '1')
    const printed = await fetch(`${PRINT_AGENT_URL}/print?${query}`, {
      method: 'POST',
      headers: { 'content-type': 'application/pdf' },
      body: new Uint8Array(pdf),
    })
    if (!printed.ok) {
      const detail = await printed.text()
      return res.status(502).json({
        error: 'print_failed',
        detail: detail.slice(0, 200),
        spentLeaf: true,
        taskId,
      })
    }
    const job = (await printed.json()) as { jobId?: string }
    return res.status(200).json({
      taskId,
      jobId: job.jobId ?? null,
      rooms: rooms ? rooms.split(',') : [],
      leavesLeft,
      spentLeaf: true,
    })
  } catch {
    return res.status(503).json({ error: 'print_agent_unreachable', spentLeaf: true, taskId })
  }
}

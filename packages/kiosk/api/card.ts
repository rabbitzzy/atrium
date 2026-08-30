/**
 * POST /api/card — the child asks for work, and a Card comes back.
 *
 * The last missing edge of the flywheel. Everything on either side of this has
 * worked for a while and nothing joined them: the planner knows what a student
 * should do next, `worksheet-print` turns that into a PDF, the print agent puts
 * a PDF on paper, and no code path ran the three in order. A child at the
 * station could scan work but never receive any.
 *
 * ── The order is still the design; the printer half of it moved ──
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
 * So the cheapest thing the station can do for a child is refuse early. An
 * empty tray is the most likely failure in a school, it is knowable in one call
 * before anything is spent, and a Leaf lost to it would be indistinguishable to
 * a seven-year-old from the machine eating their work.
 *
 * Steps 1 and 3 now run in the browser instead of here, because the print agent
 * lives on the kiosk's LAN and this route does not any more — see
 * `src/lib/printer.ts` for the whole reason. The ordering they protect is
 * unchanged and it is still an ordering: `GetCard` checks the tray before it
 * calls this route, and this route spends the Leaf only once the PDF exists.
 *
 * What is left here is step 2, and the response is the Card itself: the PDF as
 * bytes, with what the kiosk needs to talk about it in headers. Simulate mode
 * still answers JSON, because a rehearsal has no paper to return.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'node:crypto'

const WORKSHEET_URL = process.env['WORKSHEET_PRINT_URL'] ?? 'http://127.0.0.1:3002'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const body = (req.body ?? {}) as {
    studentId?: string
    subject?: string
    /** Simulate mode: preview on screen, spend a Leaf, use no paper. */
    preview?: boolean
  }
  const studentId = body.studentId
  if (!studentId) return res.status(400).json({ error: 'studentId is required' })

  // 1. The tray was checked by the caller, on the LAN the printer is on.

  // 2. Generate. This is where a Leaf goes.
  const taskId = randomUUID()
  let pdf: Buffer
  let leavesLeft: number | null = null
  let rooms: string | null = null
  try {
    const gen = await fetch(`${WORKSHEET_URL}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        studentId,
        taskId,
        ...(body.subject ? { subject: body.subject } : {}),
        ...(body.preview ? { preview: true } : {}),
      }),
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

    if (body.preview) {
      // No printer, no PDF, no paper. The Leaf was still spent, because the
      // point of a rehearsal is to exercise the economy rather than sidestep it.
      const out = (await gen.json()) as { html: string; rooms: string[]; leavesLeft: number }
      return res.status(200).json({
        taskId,
        rooms: out.rooms,
        html: out.html,
        leavesLeft: out.leavesLeft,
        spentLeaf: true,
        simulated: true,
      })
    }

    leavesLeft = Number(gen.headers.get('x-atrium-leaves') ?? '0')
    rooms = gen.headers.get('x-atrium-rooms')
    pdf = Buffer.from(await gen.arrayBuffer())
  } catch {
    return res.status(503).json({ error: 'worksheet_service_unreachable', spentLeaf: false })
  }

  // 3. Hand the Card back for the browser to print. Past this point a Leaf has
  //    been spent, and the caller is the one who now learns whether paper came
  //    out — so it reports that back to /api/print-outcome rather than a
  //    failure being known only to the child standing at the station.
  //
  //    The counts ride in headers because the body is the PDF. They are the
  //    same values the JSON response used to carry.
  res.setHeader('content-type', 'application/pdf')
  res.setHeader('x-atrium-task-id', taskId)
  res.setHeader('x-atrium-leaves', String(leavesLeft ?? 0))
  if (rooms) res.setHeader('x-atrium-rooms', rooms)
  return res.status(200).send(pdf)
}

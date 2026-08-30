/**
 * POST /api/print-outcome — did the paper actually come out?
 *
 * A consequence of moving the print hop into the browser. While the server
 * printed the Card itself, "the Leaf was spent" and "printing failed" were
 * decided in the same function, and the response could say both honestly. Now
 * the last step happens on the other side of a network boundary, on a machine
 * a seven-year-old can walk away from, so the server would otherwise never
 * learn that a Leaf bought nothing.
 *
 * That is exactly the loss `card.ts` is written to prevent — generating spends
 * the Leaf, there is no refund path, and the recovery is a teacher granting a
 * replacement (BHCS-47). A teacher can only do that if someone tells them.
 *
 * Best effort on purpose. The report is sent after the child already has their
 * outcome on screen, and a station that cannot reach this route must not turn a
 * printing problem into a second, louder failure. It answers 204 and never
 * makes the caller wait on anything.
 *
 * What it does *not* yet do is put the failure on a teacher's screen. The
 * Leaf ledger has carried a `printer_error` reason since the first migration
 * and the review queue exists, but wiring a spend-that-printed-nothing into
 * either is a decision about the teacher surface rather than about plumbing,
 * and it is still open. Until then this is a structured server log: visible to
 * whoever runs the deployment, which is strictly more than the nobody who could
 * see it before.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const body = (req.body ?? {}) as {
    studentId?: string
    taskId?: string
    ok?: boolean
    /** 'refused' — the agent answered and said no. 'unreachable' — no agent. */
    failure?: string
    detail?: string
    jobId?: string | null
  }

  const record = {
    studentId: body.studentId ?? null,
    taskId: body.taskId ?? null,
    jobId: body.jobId ?? null,
    failure: body.failure ?? null,
    detail: typeof body.detail === 'string' ? body.detail.slice(0, 300) : null,
  }

  if (body.ok) {
    console.log('[print-outcome] printed', JSON.stringify(record))
  } else {
    // A Leaf was spent and no paper came out. Loud, because this is the case a
    // teacher has to act on.
    console.error('[print-outcome] SPENT WITHOUT PAPER', JSON.stringify(record))
  }

  return res.status(204).end()
}

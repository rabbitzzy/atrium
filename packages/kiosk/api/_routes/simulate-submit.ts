/**
 * POST /api/simulate-submit — turn in a Card that was never printed.
 *
 * The far half of simulate mode. An adult marks each question the way the
 * grader would have tiered it, and everything downstream is the real path: the
 * same `POST /attempt` body the worksheet app builds, the same BKT update, the
 * same Leaf award. What is skipped is the camera and the model, which is the
 * whole saving — no paper, no print, no Gemini call, and still a genuine
 * exercise of the loop.
 *
 * Every row it produces is marked `simulated`, and `DELETE /students/:id/simulated`
 * removes them. That flag is not bookkeeping: a Floor plan that mixes a child's
 * work with an adult's button-pressing would corrupt the one thing this pilot
 * exists to measure.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { relay } from '../_lib/relay'

const SKILL_GRAPH_URL = process.env['SKILL_GRAPH_URL'] ?? 'http://127.0.0.1:3001'

const TIERS = ['mastered', 'shaky', 'needs-help', 'not-yet'] as const
type Tier = (typeof TIERS)[number]

/** The same mapping `app-worksheet/attempts.ts` applies to a real grade. */
const TIER: Record<Tier, { correct: boolean; confidence: number }> = {
  mastered: { correct: true, confidence: 1 },
  shaky: { correct: true, confidence: 0.5 },
  'needs-help': { correct: false, confidence: 0.5 },
  'not-yet': { correct: false, confidence: 1 },
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const body = (req.body ?? {}) as {
    studentId?: string
    taskId?: string
    marks?: Array<{ number: number; quality: Tier }>
  }
  if (!body.studentId || !body.taskId) {
    return res.status(400).json({ error: 'studentId and taskId are required' })
  }
  const marks = (body.marks ?? []).filter((m) => TIERS.includes(m.quality))
  if (!marks.length) return res.status(400).json({ error: 'mark at least one question' })

  // Which Rooms the Card was for. Same lookup the record hook does after a scan.
  const taskRes = await fetch(`${SKILL_GRAPH_URL}/tasks/${encodeURIComponent(body.taskId)}`)
  if (!taskRes.ok) return res.status(502).json({ error: 'unknown_task' })
  const task = (await taskRes.json()) as { kcs?: { id: string }[] }
  const kcIds = (task.kcs ?? []).map((k) => k.id)
  if (!kcIds.length) return res.status(409).json({ error: 'task_targets_no_rooms' })

  // The Leaf for turning it in, exactly as a real submission earns it.
  await fetch(`${SKILL_GRAPH_URL}/students/${encodeURIComponent(body.studentId)}/leaves/earn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId: body.taskId }),
  }).catch(() => undefined)

  return relay(res, `${SKILL_GRAPH_URL}/students/${encodeURIComponent(body.studentId)}/attempt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kcIds,
      taskId: body.taskId,
      simulated: true,
      questions: marks
        .slice()
        .sort((a, b) => a.number - b.number)
        .map((m) => ({ number: m.number, ...TIER[m.quality] })),
    }),
  })
}

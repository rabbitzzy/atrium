/**
 * The review queue (BHCS-43).
 *
 * Phase 1 of the trust arc: every AI grade, with the basis for it beside the
 * conclusion. The ordering rule is the ticket's — `needs-help` first, then
 * `shaky` — so the cases most worth a human eye are the ones a teacher reaches
 * before they run out of afternoon.
 *
 * ── What a row deliberately carries ──
 *
 * The transcript, the misconception and the suggestion travel with every
 * question, not just the tier. That is the whole design: "a queue that shows a
 * verdict without its basis produces rubber-stamping, which looks like trust
 * and is the opposite — the teacher stops reading and the system loses the
 * correction signal it was built to collect."
 *
 * The transcript matters most of the four. It is what the model thought the
 * child wrote, and it is where most wrong grades actually begin — a 4 read as a
 * 9 produces a perfectly reasoned judgement about an answer nobody gave.
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { getSupabase, rows } from '../db/client.js'

const router = new Hono()

/** A week. Older than that and a correction is history rather than feedback. */
const WINDOW_DAYS = 7

/** Worst first — the ticket's ordering, kept here so the UI cannot drift from it. */
const TIER_RANK: Record<string, number> = {
  'needs-help': 0,
  'not-yet': 1,
  shaky: 2,
  mastered: 3,
}

// GET /teacher/queue — everything graded and not yet signed off
router.get('/queue', async (c) => {
  const db = getSupabase()
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString()

  const { data, error } = await db
    .from('session_tasks')
    .select('id, session_id, task_id, capture_id, scan_url, ai_eval_json, submitted_at')
    .not('ai_eval_json', 'is', null)
    .is('teacher_override_json', null)
    .gte('submitted_at', since)
    .order('submitted_at', { ascending: false })
    .limit(200)
  if (error) return c.json({ error: error.message }, 500)

  type QueueRow = {
    id: string
    session_id: string
    task_id: string | null
    capture_id: string | null
    scan_url: string | null
    ai_eval_json: unknown
    submitted_at: string
  }
  const queued = rows<QueueRow>(data)

  // Whose work each item is. The queue is useless without a name on it, and
  // sessions is the only place that join exists.
  const sessionIds = [...new Set(queued.map((r) => r.session_id))]
  const { data: sessions } = sessionIds.length
    ? await db.from('sessions').select('id, student_id').in('id', sessionIds)
    : { data: [] }
  const studentBySession = new Map(
    rows<{ id: string; student_id: string }>(sessions).map((s) => [s.id, s.student_id]),
  )

  const items = queued
    .map((r) => {
      const evaluation = (r.ai_eval_json ?? {}) as {
        overall_quality?: string
        summary_en?: string
        summary_zh?: string
        questions?: Array<Record<string, unknown>>
      }
      return {
        sessionTaskId: r.id,
        studentId: studentBySession.get(r.session_id) ?? null,
        taskId: r.task_id,
        captureId: r.capture_id,
        scanUrl: r.scan_url,
        submittedAt: r.submitted_at,
        overallQuality: evaluation.overall_quality ?? 'unknown',
        summaryEn: evaluation.summary_en ?? '',
        summaryZh: evaluation.summary_zh ?? '',
        // Verbatim, every field. Summarising here would be the rubber-stamp.
        questions: evaluation.questions ?? [],
      }
    })
    .sort(
      (a, b) =>
        (TIER_RANK[a.overallQuality] ?? 9) - (TIER_RANK[b.overallQuality] ?? 9) ||
        (a.submittedAt < b.submittedAt ? 1 : -1),
    )

  return c.json({ items, queueLength: items.length, windowDays: WINDOW_DAYS })
})

/**
 * POST /teacher/queue/:id/viewed — how deep into the queue a teacher gets.
 *
 * Open question #1 in `teacher-direction.md` is what queue size leaves a
 * teacher in control rather than buried, and it is unanswered. It decides when
 * flagged-only review can turn on, so it is measured from the first day rather
 * than guessed at later.
 *
 * Position is the half that matters. That a teacher opened nine items says
 * little; that they stopped at the ninth of forty, every afternoon, says what
 * the queue should be capped at.
 */
router.post(
  '/queue/:id/viewed',
  zValidator('json', z.object({
    teacher: z.string().min(1),
    position: z.number().int().positive(),
    queueLength: z.number().int().nonnegative(),
  })),
  async (c) => {
    const body = c.req.valid('json')
    const db = getSupabase()
    const { error } = await db.from('teacher_reviews').insert({
      session_task_id: c.req.param('id'),
      teacher: body.teacher,
      position: body.position,
      queue_length: body.queueLength,
    })
    if (error) return c.json({ error: error.message }, 500)
    return c.json({ ok: true })
  },
)

/**
 * GET /teacher/depth — the answer to the volume question, as far as it has one.
 *
 * Deliberately raw. There is no target number to compare against yet, and
 * inventing one would be the guess this endpoint exists to replace.
 */
router.get('/depth', async (c) => {
  const db = getSupabase()
  const { data, error } = await db
    .from('teacher_reviews')
    .select('teacher, position, queue_length, opened_at')
    .order('opened_at', { ascending: false })
    .limit(500)
  if (error) return c.json({ error: error.message }, 500)

  const byTeacher = new Map<string, { deepest: number; sittings: Set<string>; items: number }>()
  for (const r of data ?? []) {
    const t = r.teacher as string
    const day = (r.opened_at as string).slice(0, 10)
    const acc = byTeacher.get(t) ?? { deepest: 0, sittings: new Set<string>(), items: 0 }
    acc.deepest = Math.max(acc.deepest, r.position as number)
    acc.sittings.add(day)
    acc.items += 1
    byTeacher.set(t, acc)
  }

  return c.json({
    teachers: [...byTeacher].map(([teacher, a]) => ({
      teacher,
      itemsOpened: a.items,
      deepestPosition: a.deepest,
      days: a.sittings.size,
      perSitting: Number((a.items / a.sittings.size).toFixed(1)),
    })),
  })
})

export default router

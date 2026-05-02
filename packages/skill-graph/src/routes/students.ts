import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { getSupabase } from '../db/client.js'

const router = new Hono()

// GET /students/:id/radar  — per-student mastery across all KCs
router.get('/:id/radar', async (c) => {
  const studentId = c.req.param('id')
  const db = getSupabase()
  const { data, error } = await db
    .from('student_kc_state')
    .select('kc_id, mastery_prob, attempts, last_seen_at')
    .eq('student_id', studentId)
  if (error) return c.json({ error: error.message }, 500)
  return c.json(data)
})

// GET /students/:id/sessions  — recent Visit history
router.get('/:id/sessions', async (c) => {
  const studentId = c.req.param('id')
  const db = getSupabase()
  const { data, error } = await db
    .from('sessions')
    .select('id, started_at, ended_at, task_count')
    .eq('student_id', studentId)
    .order('started_at', { ascending: false })
    .limit(20)
  if (error) return c.json({ error: error.message }, 500)
  return c.json(data)
})

const RecordAttemptSchema = z.object({
  taskId: z.string().uuid(),
  kcIds: z.array(z.string()),
  correct: z.boolean(),
  aiEvalJson: z.record(z.unknown()).optional(),
})

// POST /students/:id/attempt  — record a task attempt + run BKT update
router.post(
  '/:id/attempt',
  zValidator('json', RecordAttemptSchema),
  async (c) => {
    const studentId = c.req.param('id')
    const body = c.req.valid('json')
    // TODO: run BKT update for each KC in body.kcIds
    // TODO: insert into sessions / session_tasks / feedback_reports
    return c.json({ studentId, ...body, updated: true })
  },
)

export default router

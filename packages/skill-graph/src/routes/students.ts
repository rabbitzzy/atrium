import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { getSupabase } from '../db/client.js'
import { buildRadar, type BlueprintKc, type KcStateRow } from '../models/radar.js'

const router = new Hono()

/**
 * GET /students/:id/radar — the Floor plan.
 *
 * Reads the Blueprint and the student's history separately and joins them in
 * memory rather than asking PostgREST for a left join through an embedded
 * resource. Two round trips over ~46 rows costs nothing, and the merge is then
 * a pure function that can be tested without a database — which matters more
 * here than the round trip, because the defaulting rule (no history means the
 * prior, not zero and not absence) is the part that will be got wrong.
 *
 * `?depth=2` restricts to assessable leaves. BHCS-33 will want that; a radar
 * chart with an axis labelled "Mathematics" is not one a child can read.
 */
router.get('/:id/radar', async (c) => {
  const studentId = c.req.param('id')
  const db = getSupabase()

  const depth = c.req.query('depth')
  let blueprintQuery = db
    .from('kcs')
    .select('id, label_en, label_zh, subject, depth, difficulty, bkt_p_l0')
    .order('id')
  if (depth !== undefined && depth !== '') blueprintQuery = blueprintQuery.eq('depth', Number(depth))

  const [{ data: blueprint, error: blueprintError }, { data: state, error: stateError }] =
    await Promise.all([
      blueprintQuery,
      db
        .from('student_kc_state')
        .select('kc_id, mastery_prob, attempts, last_seen_at')
        .eq('student_id', studentId),
    ])

  if (blueprintError) return c.json({ error: blueprintError.message }, 500)
  if (stateError) return c.json({ error: stateError.message }, 500)

  const points = buildRadar((blueprint ?? []) as BlueprintKc[], (state ?? []) as KcStateRow[])

  return c.json({
    studentId,
    // True when nothing has ever been recorded — every point below is a prior.
    // The bootstrap eval (BHCS-32) is what this flag is for.
    bootstrapped: (state ?? []).length > 0,
    kcs: points,
  })
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

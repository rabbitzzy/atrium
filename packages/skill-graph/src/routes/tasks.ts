import { Hono } from 'hono'
import { getSupabase } from '../db/client.js'
import { planNext, type FloorPlanRoom } from '../models/frontier.js'

const router = new Hono()

/**
 * How far back to read the attempt ledger when counting failure runs.
 *
 * Only the unbroken run ending at the most recent attempt matters, so this
 * needs to cover a plausible run and nothing more. A student who has answered
 * 400 questions since their last wrong answer is not on a failure streak.
 */
const ATTEMPT_LOOKBACK = 400

// GET /tasks/next/:studentId  — the Landing: which Room this student works in next
router.get('/next/:studentId', async (c) => {
  const studentId = c.req.param('studentId')
  const db = getSupabase()

  // Only assessable leaves. A heading is not a Room and can never be assigned.
  const [
    { data: leaves, error: kcError },
    { data: state, error: stateError },
    { data: edges, error: edgeError },
    { data: attempts, error: attemptError },
  ] = await Promise.all([
    db
      .from('kcs')
      .select('id, label_en, label_zh, subject, difficulty, bkt_p_l0')
      .eq('depth', 2)
      .order('id'),
    db
      .from('student_kc_state')
      .select('kc_id, mastery_prob, attempts, evidence')
      .eq('student_id', studentId),
    db.from('kc_edges').select('from_kc_id, to_kc_id').eq('edge_type', 'prerequisite'),
    db
      .from('kc_attempts')
      .select('kc_id, correct, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(ATTEMPT_LOOKBACK),
  ])

  if (kcError) return c.json({ error: kcError.message }, 500)
  if (stateError) return c.json({ error: stateError.message }, 500)
  if (edgeError) return c.json({ error: edgeError.message }, 500)
  if (attemptError) return c.json({ error: attemptError.message }, 500)

  const stateByKc = new Map((state ?? []).map((s) => [s.kc_id as string, s]))

  const prerequisites = new Map<string, string[]>()
  for (const e of edges ?? []) {
    const to = e.to_kc_id as string
    prerequisites.set(to, [...(prerequisites.get(to) ?? []), e.from_kc_id as string])
  }

  // The run of wrong answers ending at the most recent attempt, per Room. The
  // ledger arrives newest-first, so the first correct answer closes the run.
  const failureRun = new Map<string, number>()
  const runClosed = new Set<string>()
  for (const a of attempts ?? []) {
    const kcId = a.kc_id as string
    if (runClosed.has(kcId)) continue
    if (a.correct) runClosed.add(kcId)
    else failureRun.set(kcId, (failureRun.get(kcId) ?? 0) + 1)
  }

  const rooms: FloorPlanRoom[] = (leaves ?? []).map((kc) => {
    const s = stateByKc.get(kc.id as string)
    return {
      kcId: kc.id as string,
      labelEn: kc.label_en as string,
      labelZh: kc.label_zh as string,
      subject: kc.subject as string,
      difficulty: kc.difficulty as number,
      // No history means the prior, not zero — the same rule the radar uses.
      masteryProb: (s?.mastery_prob as number | undefined) ?? (kc.bkt_p_l0 as number),
      attempts: (s?.attempts as number | undefined) ?? 0,
      evidence: (s?.evidence as number | undefined) ?? 0,
      prerequisiteIds: prerequisites.get(kc.id as string) ?? [],
      consecutiveFailures: failureRun.get(kc.id as string) ?? 0,
    }
  })

  const plan = planNext(rooms)

  return c.json({
    studentId,
    outcome: plan.outcome,
    targetKcId: plan.targetKcId,
    reason: { en: plan.reasonEn, zh: plan.reasonZh },
    needsTeacher: plan.needsTeacher,
    // Ranked alternatives, trimmed. Selection has to be inspectable
    // (product/user-stories.md) and a teacher checking the planner's judgement
    // wants to see what came second, not the whole Blueprint re-scored.
    candidates: plan.candidates.slice(0, 5),
  })
})

// GET /tasks/:id  — task detail with rubric
router.get('/:id', async (c) => {
  const taskId = c.req.param('id')
  const db = getSupabase()
  const { data, error } = await db.from('tasks').select('*').eq('id', taskId).single()
  if (error) return c.json({ error: error.message }, 404)
  return c.json(data)
})

export default router

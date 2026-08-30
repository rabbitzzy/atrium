import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { getSupabase, rows } from '../db/client.js'
import { planNext, type FloorPlanRoom, type SubjectFocus } from '../models/frontier.js'

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

  type KcRow = {
    id: string
    label_en: string
    label_zh: string
    subject: string
    difficulty: number
    bkt_p_l0: number
  }
  type StateRow = { kc_id: string; mastery_prob: number; attempts: number; evidence: number }
  type AttemptRow = { kc_id: string; correct: boolean; created_at: string }

  const stateByKc = new Map(rows<StateRow>(state).map((s) => [s.kc_id, s]))

  const prerequisites = new Map<string, string[]>()
  for (const e of rows<{ from_kc_id: string; to_kc_id: string }>(edges)) {
    prerequisites.set(e.to_kc_id, [...(prerequisites.get(e.to_kc_id) ?? []), e.from_kc_id])
  }

  // The run of wrong answers ending at the most recent attempt, per Room. The
  // ledger arrives newest-first, so the first correct answer closes the run.
  const failureRun = new Map<string, number>()
  const runClosed = new Set<string>()
  for (const a of rows<AttemptRow>(attempts)) {
    const kcId = a.kc_id
    if (runClosed.has(kcId)) continue
    if (a.correct) runClosed.add(kcId)
    else failureRun.set(kcId, (failureRun.get(kcId) ?? 0) + 1)
  }

  const rooms: FloorPlanRoom[] = rows<KcRow>(leaves).map((kc) => {
    const s = stateByKc.get(kc.id)
    return {
      kcId: kc.id,
      labelEn: kc.label_en,
      labelZh: kc.label_zh,
      subject: kc.subject,
      difficulty: kc.difficulty,
      // No history means the prior, not zero — the same rule the radar uses.
      masteryProb: s?.mastery_prob ?? kc.bkt_p_l0,
      attempts: s?.attempts ?? 0,
      evidence: s?.evidence ?? 0,
      prerequisiteIds: prerequisites.get(kc.id) ?? [],
      consecutiveFailures: failureRun.get(kc.id) ?? 0,
    }
  })

  // `?subject=math` points the Visit somewhere (BHCS-91). Anything else is
  // ignored rather than erroring: an unknown subject should not stop a child
  // getting work.
  const asked = c.req.query('subject')
  const focus: SubjectFocus | undefined =
    asked === 'math' || asked === 'lang/en' || asked === 'lang/zh' ? asked : undefined

  const plan = planNext(rooms, focus)

  return c.json({
    studentId,
    subject: focus ?? null,
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

const CreateTaskSchema = z.object({
  /** Supplied by the caller so the row and the printed QR carry the same id. */
  id: z.string().uuid(),
  titleEn: z.string().min(1),
  titleZh: z.string().min(1),
  difficulty: z.number().int().min(1).max(5),
  estMinutes: z.number().int().positive().optional(),
  kcIds: z.array(z.string()).min(1),
  /** What was actually asked, and where the answers will be on the page. */
  rubric: z.record(z.unknown()),
})

/**
 * POST /tasks — record a Card that has been generated (BHCS-37).
 *
 * Without this the round trip has no far end. The printer put a task id in the
 * QR header, nothing ever wrote a `tasks` row, and so a scanned Card decoded to
 * an id that resolved to nothing — the system could read whose page it was and
 * still had no idea what had been asked on it.
 *
 * The id comes from the caller rather than the database, because the QR is
 * printed from it and the two have to be the same string. Idempotent on that
 * id: a reprint of the same Card is the same task, not a second one.
 */
router.post('/', zValidator('json', CreateTaskSchema), async (c) => {
  const body = c.req.valid('json')
  const db = getSupabase()

  // Only assessable leaves — the same rule the attempt route enforces, checked
  // here too because this is where a Card commits to what it is about.
  const { data: kcs, error: kcError } = await db
    .from('kcs')
    .select('id, depth')
    .in('id', body.kcIds)
  if (kcError) return c.json({ error: kcError.message }, 500)

  const targets = rows<{ id: string; depth: number }>(kcs)
  const found = new Set(targets.map((k) => k.id))
  const unknown = body.kcIds.filter((id) => !found.has(id))
  if (unknown.length) return c.json({ error: 'unknown kcIds', unknown }, 400)
  const headings = targets.filter((k) => k.depth !== 2).map((k) => k.id)
  if (headings.length) return c.json({ error: 'a Card cannot target a heading', headings }, 400)

  const { error: taskError } = await db.from('tasks').upsert(
    {
      id: body.id,
      title_en: body.titleEn,
      title_zh: body.titleZh,
      difficulty: body.difficulty,
      ...(body.estMinutes !== undefined ? { est_minutes: body.estMinutes } : {}),
      rubric_json: body.rubric,
    },
    { onConflict: 'id' },
  )
  if (taskError) return c.json({ error: taskError.message }, 500)

  const { error: linkError } = await db
    .from('task_kcs')
    .upsert(
      body.kcIds.map((kcId) => ({ task_id: body.id, kc_id: kcId })),
      { onConflict: 'task_id,kc_id' },
    )
  if (linkError) return c.json({ error: linkError.message }, 500)

  return c.json({ id: body.id, kcIds: body.kcIds }, 201)
})

// GET /tasks/:id  — task detail with rubric
router.get('/:id', async (c) => {
  const taskId = c.req.param('id')
  const db = getSupabase()

  const { data: task, error } = await db.from('tasks').select('*').eq('id', taskId).single()
  if (error) return c.json({ error: error.message }, 404)

  // The Rooms this Card is about, with their labels — everything the evaluator
  // needs to grade it and everything a Debrief needs to name it. One call,
  // because the scan path is on the 30-second budget.
  const { data: links } = await db.from('task_kcs').select('kc_id').eq('task_id', taskId)
  const kcIds = rows<{ kc_id: string }>(links).map((l) => l.kc_id)

  const { data: kcs } = kcIds.length
    ? await db.from('kcs').select('id, label_en, label_zh, subject, difficulty').in('id', kcIds)
    : { data: [] }

  return c.json({ ...task, kcs: kcs ?? [] })
})

export default router

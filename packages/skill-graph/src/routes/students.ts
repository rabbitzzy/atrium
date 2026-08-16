import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { getSupabase } from '../db/client.js'
import {
  applySessionFloor,
  bktUpdateWeighted,
  confidenceBand,
  type BktParams,
} from '../models/bkt.js'
import { derivePlacement, type PlacementRoom } from '../models/placement.js'
import { buildRadar, type BlueprintKc, type KcStateRow } from '../models/radar.js'
import { buildSpokes, type Spoke } from '../models/spokes.js'

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
        .select('kc_id, mastery_prob, attempts, evidence, last_seen_at')
        .eq('student_id', studentId),
    ])

  if (blueprintError) return c.json({ error: blueprintError.message }, 500)
  if (stateError) return c.json({ error: stateError.message }, 500)

  const points = buildRadar((blueprint ?? []) as BlueprintKc[], (state ?? []) as KcStateRow[])

  // `?spokes=1` adds the drawable version: thirteen strand axes rather than
  // thirty Rooms (BHCS-33). Computed here rather than in each display surface
  // so the kiosk, the teacher view and the parent portal cannot drift into
  // three different numbers for the same child.
  let spokes: Spoke[] | undefined
  if (c.req.query('spokes') !== undefined && c.req.query('spokes') !== '0') {
    const { data: strands, error } = await db
      .from('kcs')
      .select('id, label_en, label_zh, subject')
      .eq('depth', 1)
      .order('id')
    if (error) return c.json({ error: error.message }, 500)

    spokes = buildSpokes(
      points.map((p) => ({
        kcId: p.kcId,
        subject: p.subject,
        masteryProb: p.masteryProb,
        attempts: p.attempts,
        evidence: p.evidence,
        seen: p.seen,
      })),
      (strands ?? []).map((s) => ({
        id: s.id as string,
        labelEn: s.label_en as string,
        labelZh: s.label_zh as string,
        subject: s.subject as string,
      })),
    )
  }

  return c.json({
    studentId,
    // True when nothing has ever been recorded — every point below is a prior.
    // The bootstrap eval (BHCS-32) is what this flag is for.
    bootstrapped: (state ?? []).length > 0,
    kcs: points,
    ...(spokes ? { spokes } : {}),
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
  kcIds: z.array(z.string()).min(1),
  correct: z.boolean(),
  /**
   * How far to believe this grade, 0 exclusive to 1. Absent means full
   * confidence, which is every caller today: nothing emits a confidence yet.
   */
  confidence: z.number().gt(0).lte(1).optional(),
  /** `captures.id`. Absent means the attempt did not come from a scan. */
  captureId: z.string().uuid().optional(),
  /** Continue an open Visit. Absent opens one. */
  sessionId: z.string().uuid().optional(),
  /** The Card, once Cards target Rooms (BHCS-35). */
  taskId: z.string().uuid().optional(),
  scanUrl: z.string().optional(),
  aiEvalJson: z.record(z.unknown()).optional(),
  debrief: z
    .object({
      overallQuality: z.enum(['mastered', 'shaky', 'needs-help', 'not-yet']),
      questions: z.array(z.unknown()),
      summaryEn: z.string(),
      summaryZh: z.string(),
      nextFocusKcId: z.string().optional(),
    })
    .optional(),
})

/**
 * POST /students/:id/attempt — a page becomes movement on the Blueprint.
 *
 * Order matters here and is not the obvious one. The ledger row is written
 * *before* the Floor plan is touched, because the unique index on
 * `(capture_id, kc_id)` is the only real defence against a child putting the
 * same page under the camera twice — which BHCS-29 notes is the likeliest
 * reason they would, since they could not tell whether it worked. The select
 * below is a courtesy that makes the common replay cheap and quiet; the
 * constraint is what makes it correct when two requests arrive together.
 */
router.post('/:id/attempt', zValidator('json', RecordAttemptSchema), async (c) => {
  const studentId = c.req.param('id')
  const body = c.req.valid('json')
  const db = getSupabase()
  const weight = body.confidence ?? 1
  const kcIds = [...new Set(body.kcIds)]

  // ── The Rooms being attempted ──────────────────────────────
  const { data: kcs, error: kcError } = await db
    .from('kcs')
    .select('id, depth, bkt_p_l0, bkt_p_t, bkt_p_s, bkt_p_g')
    .in('id', kcIds)
  if (kcError) return c.json({ error: kcError.message }, 500)

  const kcById = new Map((kcs ?? []).map((k) => [k.id as string, k]))
  const unknown = kcIds.filter((id) => !kcById.has(id))
  if (unknown.length) return c.json({ error: 'unknown kcIds', unknown }, 400)

  // Headings are not assessable — 004 asserts it of the graph, and the same
  // rule has to hold at the door or an attempt could grant mastery of
  // "Mathematics" and unlock every Room beneath it at once.
  const headings = (kcs ?? []).filter((k) => k.depth !== 2).map((k) => k.id as string)
  if (headings.length) {
    return c.json({ error: 'kcIds must be assessable leaves, not headings', headings }, 400)
  }

  // ── Replay? ────────────────────────────────────────────────
  let alreadyApplied: string[] = []
  if (body.captureId) {
    const { data: seen, error } = await db
      .from('kc_attempts')
      .select('kc_id')
      .eq('capture_id', body.captureId)
      .in('kc_id', kcIds)
    if (error) return c.json({ error: error.message }, 500)
    alreadyApplied = (seen ?? []).map((r) => r.kc_id as string)
  }
  const todo = kcIds.filter((id) => !alreadyApplied.includes(id))

  if (!todo.length) {
    const state = await readState(db, studentId, kcIds)
    return c.json({
      studentId,
      replayed: true,
      replayedKcIds: alreadyApplied,
      updates: kcIds.map((id) => {
        const s = state.get(id)
        const mastery = s?.mastery_prob ?? (kcById.get(id)!.bkt_p_l0 as number)
        const evidence = s?.evidence ?? 0
        return {
          kcId: id,
          before: mastery,
          after: mastery,
          delta: 0,
          attempts: s?.attempts ?? 0,
          evidence,
          band: confidenceBand(mastery, evidence),
        }
      }),
    })
  }

  // ── The Visit ──────────────────────────────────────────────
  let sessionId = body.sessionId ?? null
  if (!sessionId) {
    const { data: session, error } = await db
      .from('sessions')
      .insert({ student_id: studentId })
      .select('id')
      .single()
    if (error) return c.json({ error: error.message }, 500)
    sessionId = session.id as string
  }

  const sessionTaskRow: Record<string, unknown> = {
    session_id: sessionId,
    submitted_at: new Date().toISOString(),
  }
  if (body.taskId) sessionTaskRow['task_id'] = body.taskId
  if (body.scanUrl) sessionTaskRow['scan_url'] = body.scanUrl
  if (body.aiEvalJson) sessionTaskRow['ai_eval_json'] = body.aiEvalJson

  const { data: sessionTask, error: stError } = await db
    .from('session_tasks')
    .insert(sessionTaskRow)
    .select('id')
    .single()
  if (stError) return c.json({ error: stError.message }, 500)
  const sessionTaskId = sessionTask.id as string

  // ── Move the Floor plan ────────────────────────────────────
  const state = await readState(db, studentId, todo)

  // Where each Room stood when this Visit began. The floor is measured from
  // there, so ten questions on one Card cannot walk a number down ten times.
  const { data: visitFirsts, error: vfError } = await db
    .from('kc_attempts')
    .select('kc_id, mastery_before, created_at')
    .eq('session_id', sessionId)
    .in('kc_id', todo)
    .order('created_at', { ascending: true })
  if (vfError) return c.json({ error: vfError.message }, 500)
  const visitStart = new Map<string, number>()
  for (const row of visitFirsts ?? []) {
    if (!visitStart.has(row.kc_id as string)) {
      visitStart.set(row.kc_id as string, row.mastery_before as number)
    }
  }

  const updates: unknown[] = []
  const replayedNow: string[] = []

  for (const kcId of todo) {
    const kc = kcById.get(kcId)!
    const prior = state.get(kcId)
    const before = prior?.mastery_prob ?? (kc.bkt_p_l0 as number)
    const params: BktParams = {
      pL0: kc.bkt_p_l0 as number,
      pT: kc.bkt_p_t as number,
      pS: kc.bkt_p_s as number,
      pG: kc.bkt_p_g as number,
    }

    const raw = bktUpdateWeighted(before, body.correct, params, weight)
    const after = applySessionFloor(raw, visitStart.get(kcId) ?? before)

    // Ledger first: this insert is the idempotency barrier.
    const ledger: Record<string, unknown> = {
      student_id: studentId,
      kc_id: kcId,
      session_id: sessionId,
      session_task_id: sessionTaskId,
      correct: body.correct,
      weight,
      mastery_before: before,
      mastery_after: after,
    }
    if (body.captureId) ledger['capture_id'] = body.captureId

    const { error: ledgerError } = await db.from('kc_attempts').insert(ledger)
    if (ledgerError) {
      // 23505: another request wrote this exact (capture, Room) first. That is
      // the double-scan case winning the race, not a failure.
      if (ledgerError.code === '23505') {
        replayedNow.push(kcId)
        continue
      }
      return c.json({ error: ledgerError.message }, 500)
    }

    const attempts = (prior?.attempts ?? 0) + 1
    const evidence = (prior?.evidence ?? 0) + weight
    const { error: stateError } = await db.from('student_kc_state').upsert(
      {
        student_id: studentId,
        kc_id: kcId,
        mastery_prob: after,
        attempts,
        evidence,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,kc_id' },
    )
    if (stateError) return c.json({ error: stateError.message }, 500)

    updates.push({
      kcId,
      before,
      after,
      delta: after - before,
      // True when the Visit bound clipped the fall — worth surfacing, because
      // it means the raw evidence said something harsher than the number shows.
      floored: after !== raw,
      attempts,
      evidence,
      band: confidenceBand(after, evidence),
    })
  }

  // ── The Debrief ────────────────────────────────────────────
  let feedbackReportId: string | null = null
  if (body.debrief) {
    const report: Record<string, unknown> = {
      session_task_id: sessionTaskId,
      student_id: studentId,
      overall_quality: body.debrief.overallQuality,
      questions_json: body.debrief.questions,
      summary_en: body.debrief.summaryEn,
      summary_zh: body.debrief.summaryZh,
    }
    if (body.debrief.nextFocusKcId) report['next_focus_kc_id'] = body.debrief.nextFocusKcId
    const { data: fr, error } = await db.from('feedback_reports').insert(report).select('id').single()
    if (error) return c.json({ error: error.message }, 500)
    feedbackReportId = fr.id as string
  }

  // Keep the Visit's own count honest; nothing else derives it.
  const { count } = await db
    .from('session_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
  await db.from('sessions').update({ task_count: count ?? 0 }).eq('id', sessionId)

  return c.json({
    studentId,
    replayed: false,
    sessionId,
    sessionTaskId,
    feedbackReportId,
    replayedKcIds: [...alreadyApplied, ...replayedNow],
    updates,
  })
})

const PlacementSchema = z.object({
  /** Who is asserting this. Recorded so the claim has an author. */
  placedBy: z.string().min(1),
  /** Subject-root id to grade band, e.g. `{ "math": 3, "lang/zh": 1 }`. */
  levels: z.record(z.number().int().min(1).max(5)),
  rooms: z.record(z.enum(['mastered', 'shaky', 'needs-help', 'not-yet'])).optional(),
  note: z.string().optional(),
})

/**
 * POST /students/:id/placement — a teacher says where this child starts.
 *
 * Flywheel step 1, and the cheap answer to the cold start: BKT needs five to
 * ten attempts per skill before it is worth anything, so the first six weeks
 * run on priors either way. This decides whether those priors came from a
 * teacher who knows the child or from a table of defaults.
 *
 * Everything written here is a prior and nothing is evidence. The rows carry
 * `attempts: 0` and `evidence: 0`, which is what stops BHCS-30 reading a
 * teacher's guess as mastery and skipping the Room — the failure mode where a
 * child is never asked about a skill an adult assumed they had.
 */
router.post('/:id/placement', zValidator('json', PlacementSchema), async (c) => {
  const studentId = c.req.param('id')
  const body = c.req.valid('json')
  const db = getSupabase()

  const [{ data: leaves, error: kcError }, { data: existing, error: stateError }] = await Promise.all([
    db.from('kcs').select('id, label_en, subject, difficulty, bkt_p_l0').eq('depth', 2).order('id'),
    db.from('student_kc_state').select('kc_id, attempts').eq('student_id', studentId),
  ])
  if (kcError) return c.json({ error: kcError.message }, 500)
  if (stateError) return c.json({ error: stateError.message }, 500)

  const attemptsByKc = new Map((existing ?? []).map((r) => [r.kc_id as string, r.attempts as number]))
  const rooms: PlacementRoom[] = (leaves ?? []).map((kc) => ({
    kcId: kc.id as string,
    labelEn: kc.label_en as string,
    subject: kc.subject as string,
    difficulty: kc.difficulty as number,
    bktPL0: kc.bkt_p_l0 as number,
    attempts: attemptsByKc.get(kc.id as string) ?? 0,
  }))

  const claim = body.rooms ? { levels: body.levels, rooms: body.rooms } : { levels: body.levels }
  const result = derivePlacement(claim, rooms)

  // A claim that names nothing real is a typo, not a placement. Refuse it
  // rather than writing a Floor plan the teacher did not intend.
  if (!result.seeded.length && (result.unknownRoots.length || result.unknownRooms.length)) {
    return c.json(
      {
        error: 'placement matched no Rooms',
        unknownRoots: result.unknownRoots,
        unknownRooms: result.unknownRooms,
      },
      400,
    )
  }

  const now = new Date().toISOString()
  if (result.seeded.length) {
    const { error } = await db.from('student_kc_state').upsert(
      result.seeded.map((s) => ({
        student_id: studentId,
        kc_id: s.kcId,
        mastery_prob: s.masteryProb,
        attempts: 0,
        evidence: 0,
        updated_at: now,
        // last_seen_at stays null: nobody has seen this child work on it.
      })),
      { onConflict: 'student_id,kc_id' },
    )
    if (error) return c.json({ error: error.message }, 500)
  }

  const placementRow: Record<string, unknown> = {
    student_id: studentId,
    placed_by: body.placedBy,
    claim_json: claim,
    seeded_kc_ids: result.seeded.map((s) => s.kcId),
  }
  if (body.note) placementRow['note'] = body.note

  const { data: placement, error: placementError } = await db
    .from('student_placements')
    .insert(placementRow)
    .select('id')
    .single()
  if (placementError) return c.json({ error: placementError.message }, 500)

  const leaves_ = await grantBootstrapLeaves(db, studentId, body.placedBy)

  return c.json({
    studentId,
    placementId: placement.id as string,
    seeded: result.seeded,
    skipped: result.skipped,
    unknownRoots: result.unknownRoots,
    unknownRooms: result.unknownRooms,
    leaves: leaves_,
  })
})

/**
 * The two Leaves that make a first Card printable (BHCS-32, eco-design.md).
 *
 * Idempotent, and that matters more than it looks: a placement is redone
 * whenever a teacher revises their view, and a redo must not mint paper. The
 * existing `student_print_state` row is the guard — a student who already has
 * one has already been bootstrapped, whatever their balance is now.
 */
async function grantBootstrapLeaves(
  db: ReturnType<typeof getSupabase>,
  studentId: string,
  placedBy: string,
): Promise<{ balance: number; granted: number }> {
  const { data: existing } = await db
    .from('student_print_state')
    .select('leaf_balance')
    .eq('student_id', studentId)
    .maybeSingle()

  if (existing) return { balance: existing.leaf_balance as number, granted: 0 }

  // The column defaults carry the bootstrap grant (2 Leaves) — restating it
  // here would put the number in two places.
  const { data: created, error } = await db
    .from('student_print_state')
    .insert({ student_id: studentId })
    .select('leaf_balance, lifetime_earned')
    .single()
  if (error || !created) return { balance: 0, granted: 0 }

  await db.from('print_events').insert({
    student_id: studentId,
    event_type: 'grant',
    amount: created.lifetime_earned as number,
    reason: 'bootstrap',
    granted_by: placedBy,
  })

  return { balance: created.leaf_balance as number, granted: created.lifetime_earned as number }
}

interface StateRow {
  mastery_prob: number
  attempts: number
  evidence: number
}

async function readState(
  db: ReturnType<typeof getSupabase>,
  studentId: string,
  kcIds: string[],
): Promise<Map<string, StateRow>> {
  const { data } = await db
    .from('student_kc_state')
    .select('kc_id, mastery_prob, attempts, evidence')
    .eq('student_id', studentId)
    .in('kc_id', kcIds)
  return new Map(
    (data ?? []).map((r) => [
      r.kc_id as string,
      { mastery_prob: r.mastery_prob as number, attempts: r.attempts as number, evidence: r.evidence as number },
    ]),
  )
}

export default router

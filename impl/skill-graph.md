# Skill Graph Service — Implementation Plan

Package: `packages/skill-graph`  
Tech: Hono + Node, TypeScript, Supabase Postgres  
Port: 3001

## Responsibility
- Store and serve the Blueprint (KC DAG)
- Maintain per-student Floor plans (BKT mastery state)
- Answer `nextTask(studentId)` — the frontier query
- Record attempts and update BKT state
- Expose a teacher review queue

## Data model (see `infra/supabase/migrations/001_initial_schema.sql`)

```
kcs ─────┐
         ├─ kc_edges (DAG)
kcs ─────┘

student_kc_state (student × KC → mastery_prob, attempts)

tasks ─── task_kcs ─── kcs

sessions ─── session_tasks ─── feedback_reports
```

## API routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | /students/:id/radar | Floor plan — all KC mastery probs |
| GET | /students/:id/sessions | Recent Visit history |
| POST | /students/:id/attempt | Record attempt + run BKT update |
| GET | /tasks/next/:studentId | Frontier KC query → suggested Card |
| GET | /tasks/:id | Task detail + rubric |
| GET | /kcs | Full Blueprint (paginated) |
| GET | /teacher/queue | Pending evaluations needing review |
| PATCH | /teacher/session-tasks/:id | Approve or override evaluation |

## Frontier algorithm (nextTask)

Phase 0 stub: KC with lowest mastery_prob < 0.8 that has been attempted.  
Phase 1 target:
1. Fetch student's current floor plan (all `student_kc_state` rows)
2. Traverse Blueprint: for each KC where `mastery_prob ≥ 0.8`, unlock its `to_kc_id` edges
3. From the unlocked set, pick KCs in the "zone of proximal development": `0.3 ≤ mastery_prob ≤ 0.7`
4. Among those, pick the KC with the most prerequisite edges already mastered (i.e., most scaffolded)
5. Return the top-1 KC; if the student has never been seen, return root KCs with `depth=2` as the bootstrap eval set

## BKT update flow (on POST /students/:id/attempt)

```typescript
for each kcId in body.kcIds:
  1. fetch current mastery_prob from student_kc_state (or default to kc.bkt_p_l0)
  2. call bktUpdate(current, body.correct, kcParams)
  3. upsert student_kc_state with new mastery_prob, increment attempts
```

BKT params are stored per-KC in the `kcs` table. Start with defaults from `DEFAULT_BKT_PARAMS`; refine with real data after 10K+ interactions.

## Teacher review queue

`GET /teacher/queue` returns `session_tasks` where:
- `ai_eval_json IS NOT NULL`
- `teacher_override_json IS NULL`
- `submitted_at > now() - interval '7 days'`

Sorted by `overall_quality = 'needs-help'` first, then `overall_quality = 'shaky'`.  
`PATCH /teacher/session-tasks/:id` writes `teacher_override_json` and logs the delta for rubric refinement.

## Environment variables

```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
PORT=3001
```

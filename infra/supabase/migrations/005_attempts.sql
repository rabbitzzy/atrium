-- Attempts: the ledger behind a mastery update (BHCS-29)
--
-- `POST /students/:id/attempt` validated its body, ignored it, and returned
-- `{ updated: true }`. Making it real needs three things the schema did not
-- have, and each one exists to satisfy a rule the ticket states in prose.
--
-- ── 1. Something to widen ──
--
-- BHCS-29: "a low-confidence evaluation widens the confidence band rather than
-- shifting the mean." CLAUDE.md lists a confidence band in Student State.
-- `student_kc_state` had no such column, and BKT does not produce a credible
-- interval on its own — its output is a point estimate.
--
-- `evidence` is the column that makes both true at once. It accumulates the
-- *weight* of each attempt rather than counting attempts: an evaluation the
-- model was sure of contributes 1.0, one it was unsure of contributes less.
-- Because the same weight also scales how far the mean moves, a shaky grade
-- automatically does both halves of the rule — it shifts the mean less, and it
-- leaves the band wider, because the band is a function of `evidence`.
--
-- It ships inert and that is deliberate. Nothing emits a confidence today —
-- `WORKSHEET_SCHEMA` in app-worksheet has no such field — so every weight is
-- 1.0 and `evidence` tracks `attempts` exactly. When the grader learns to say
-- how sure it is, the behaviour appears with no migration and no code change
-- here. Changing a shipped grading prompt belongs to BHCS-31 or BHCS-23, not
-- to this ticket.
--
-- ── 2. Something to be idempotent against ──
--
-- BHCS-29: "A student can put the same page under the camera twice — because
-- they were not sure it worked, which is the most likely reason. Submitting
-- the same capture twice must not update mastery twice. Key on the capture id."
--
-- There was nothing to key on: `session_tasks` holds a `scan_url` string and
-- no capture reference, and the request body had no capture id either. The
-- ledger below carries one, and the partial unique index is the actual
-- guarantee — not the service's pre-check, which races. A row per (capture,
-- Room) also answers two questions nobody could ask before: what a child's
-- mastery was immediately before a page moved it, and how many times they have
-- hit the same Room, which is the signal BHCS-46 needs.
--
-- `capture_id` deliberately carries no foreign key. `captures` belongs to the
-- kiosk platform and this table belongs to skill-graph; they share a database
-- today and may not always, and the platform must not acquire a dependency on
-- the fact that mastery exists.
--
-- ── 3. Somewhere to put an attempt that has no Card ──
--
-- `session_tasks.task_id` was NOT NULL against `tasks`, and `tasks` stays
-- empty until BHCS-35 generates real Cards. So no attempt could be recorded at
-- all — not even the hand-fed ones the pilot needs in order to exercise any of
-- this before the Cards epic lands. It is nullable now: an attempt can precede
-- the Card it will eventually cite.

begin;

-- ────────────────────────────────────────────────────────────
-- Floor plan: evidence
-- ────────────────────────────────────────────────────────────

alter table student_kc_state
  add column if not exists evidence double precision not null default 0
    check (evidence >= 0);

comment on column student_kc_state.evidence is
  'Summed weight of attempts, not their count. Equal to attempts while every evaluation is full-confidence. Drives the confidence band; see confidenceBand() in models/bkt.ts.';

-- Worth knowing when reading a Floor plan: `mastery_prob` still defaults to
-- 0.0, which is not the same as "no evidence" — the honest no-evidence value
-- is the KC's own bkt_p_l0, and it is what the radar substitutes for a missing
-- row. Anything inserting into this table must set mastery_prob explicitly
-- rather than letting the default stand, or it claims a child certainly does
-- not know something nobody has ever asked them.
comment on column student_kc_state.mastery_prob is
  'BKT posterior. Set explicitly on insert — the 0.0 default asserts certain non-mastery, which is never what an unseen Room means.';

-- ────────────────────────────────────────────────────────────
-- The attempt ledger
-- ────────────────────────────────────────────────────────────

create table if not exists kc_attempts (
  id              uuid primary key default gen_random_uuid(),
  student_id      text        not null,
  kc_id           text        not null references kcs(id),

  -- Soft reference to captures.id; see the header for why there is no FK.
  -- Null means the attempt did not come from a scan — a teacher entering a
  -- result by hand, or a hand-fed pilot attempt.
  capture_id      uuid,
  session_id      uuid        references sessions(id),
  session_task_id uuid        references session_tasks(id),

  correct         boolean     not null,
  -- How much this observation is worth. 1.0 is a full-confidence grade.
  weight          double precision not null default 1.0
                    check (weight > 0 and weight <= 1),

  -- The audit trail a teacher actually asks for: what the number was before
  -- this page, and what it became. Never recomputed — stored as applied, so a
  -- later change to the BKT parameters cannot rewrite history.
  mastery_before  double precision not null,
  mastery_after   double precision not null,

  created_at      timestamptz not null default now()
);

-- The real idempotency guarantee. Partial, so hand-entered attempts with no
-- capture never collide with each other.
create unique index if not exists kc_attempts_capture_kc_uniq
  on kc_attempts (capture_id, kc_id)
  where capture_id is not null;

-- "How is this child doing in this Room, most recent first" — the teacher
-- query, and the one BHCS-46 counts against.
create index if not exists kc_attempts_student_kc_idx
  on kc_attempts (student_id, kc_id, created_at desc);

-- Finding where a Room stood when a Visit began, which is what bounds how far
-- one bad session may push it down.
create index if not exists kc_attempts_session_kc_idx
  on kc_attempts (session_id, kc_id, created_at);

comment on table kc_attempts is
  'One row per (attempt, Room). Append-only audit trail and the idempotency key for re-scanned captures.';

-- ────────────────────────────────────────────────────────────
-- An attempt may precede its Card
-- ────────────────────────────────────────────────────────────

alter table session_tasks alter column task_id drop not null;

comment on column session_tasks.task_id is
  'Null until BHCS-35 generates Cards that target Rooms. An attempt can be recorded before the Card it will cite exists.';

commit;

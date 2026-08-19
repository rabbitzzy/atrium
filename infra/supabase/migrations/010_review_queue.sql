-- The review queue (BHCS-43)
--
-- Phase 1 of the trust arc. The teacher's model is "the AI does the first pass,
-- I sign off", which is how they already work with a student teacher, and the
-- familiarity is the point.
--
-- Two things the queue needs that the schema could not give it.
--
-- ── The scan, beside the grade ──
--
-- The ticket is emphatic that a row must show the whole basis for a judgement
-- and not its conclusion, because "a queue that shows a verdict without its
-- basis produces rubber-stamping, which looks like trust and is the opposite".
-- The most important part of that basis is the image, and `session_tasks` had
-- no way to reach one: it holds a `scan_url` text column nothing populates,
-- while the pixels, the crop metadata and the focus score all live on a
-- `captures` row it has never referenced.
--
-- `capture_id` closes that. Soft reference, no foreign key, for the reason
-- `kc_attempts.capture_id` has none: `captures` belongs to the kiosk platform
-- and this table belongs to skill-graph, they share a database today and may
-- not always, and the platform must not acquire a dependency on the fact that
-- review exists.
--
-- ── How much reviewing actually happens ──
--
-- Open question #1 in `docs/pedagogy/teacher-direction.md` is what queue size
-- leaves a teacher feeling in control rather than buried, and it is unanswered.
-- The ticket asks for it to be instrumented from day one, because that number
-- decides when Phase 2's flagged-only review can turn on, and guessing it is
-- how the feature fails.
--
-- So a row per item a teacher actually opens, carrying its position in the
-- list. Position is the interesting half: knowing a teacher opened nine items
-- says less than knowing they stopped at the ninth of forty, every time.

begin;

alter table session_tasks
  add column if not exists capture_id uuid;

comment on column session_tasks.capture_id is
  'The scan this grade came from. Soft reference to captures.id — no FK, because captures belongs to the kiosk platform.';

create index if not exists session_tasks_review_idx
  on session_tasks (submitted_at desc)
  where ai_eval_json is not null and teacher_override_json is null;

create table if not exists teacher_reviews (
  id              uuid primary key default gen_random_uuid(),
  session_task_id uuid not null references session_tasks(id),
  /** Free text: teacher identity lives in the BHCS portal, never here. */
  teacher         text not null,
  /** 1-based rank in the queue when it was opened. */
  position        int  not null check (position > 0),
  /** How long the queue was at that moment, so position reads as a fraction. */
  queue_length    int  not null check (queue_length >= 0),
  opened_at       timestamptz not null default now()
);

create index if not exists teacher_reviews_teacher_idx
  on teacher_reviews (teacher, opened_at desc);

comment on table teacher_reviews is
  'One row per queue item a teacher opened. Answers how deep into the queue they get before stopping, which is what decides when flagged-only review can begin.';

commit;

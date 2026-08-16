-- Teacher-entered placement (BHCS-32)
--
-- The cold-start answer, decided rather than defaulted: no diagnostic Card and
-- no adaptive sequence, just a teacher saying roughly where a child already is.
-- A five-minute form beats twenty minutes of a seven-year-old's first-ever
-- session, it does not make that first session feel like a test, and it hands
-- the teacher the first-mover role in the trust arc instead of asking them to
-- audit something the machine did first.
--
-- The Floor plan rows themselves need no new schema — `student_kc_state` is
-- already the right shape. What needs a table is the *claim*: a teacher setting
-- thirty priors in one gesture is an assertion someone made about a child, and
-- the product's first principle is that a teacher can inspect everything the
-- system believes and see where it came from. A placement that silently
-- rewrote the Floor plan and left no record would be the one thing in this
-- system with no audit trail.
--
-- Kept deliberately dumb: the payload is stored as given, not normalised into
-- the derived priors. What the teacher said and what the system made of it are
-- two different facts, and only the first is worth preserving verbatim — the
-- derivation lives in `models/placement.ts` and will be tuned, at which point
-- an old placement should still say what the teacher actually claimed.

begin;

create table if not exists student_placements (
  id           uuid primary key default gen_random_uuid(),
  student_id   text        not null,

  -- Who is asserting this. Free text rather than a foreign key: teacher
  -- identity lives in the BHCS portal and this service never holds PII.
  placed_by    text        not null,

  -- Exactly what was submitted: `{ levels: { math: 3, ... }, rooms: { ... } }`.
  -- Stored verbatim so a re-derivation under changed weights can still be
  -- traced back to the claim it came from.
  claim_json   jsonb       not null,

  -- Free-text context from the teacher: "new to the school, strong in maths,
  -- has never written characters".
  note         text,

  -- Which Rooms this placement actually wrote. Rooms with real attempts are
  -- skipped, so this is usually smaller than the Blueprint and shrinks every
  -- time a placement is redone.
  seeded_kc_ids text[]     not null default '{}',

  created_at   timestamptz not null default now()
);

create index if not exists student_placements_student_idx
  on student_placements (student_id, created_at desc);

comment on table student_placements is
  'A teacher''s claim about where a student starts. Append-only: redoing a placement adds a row, it never edits one.';

comment on column student_placements.seeded_kc_ids is
  'Rooms this placement wrote. Rooms with attempts are never overwritten — measurement outranks estimate.';

commit;

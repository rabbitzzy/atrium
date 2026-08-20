-- One Card, counted once, however many photographs
--
-- BHCS-29 keyed the attempt ledger on the capture, to stop a child who was not
-- sure the upload worked from submitting the same capture twice. That is a real
-- habit and the guard was right, but it guards the wrong noun.
--
-- A capture is a photograph. A child who photographs their finished Card a
-- second time — because they are not sure it took, which is the same instinct —
-- produces a *different* capture id, so nothing stopped it, and five questions
-- of work moved their mastery twice. Nobody would see it: the Leaf is keyed on
-- the task and would not double, so the balance stays honest while the Floor
-- plan quietly runs ahead of the work.
--
-- The thing that should be counted once is the piece of work, which is the Card
-- when there is one and the page when there is not. `coalesce(task_id,
-- capture_id)` is that, and one index says it.
--
-- ── The case this deliberately still allows ──
--
-- A child does three of five questions, scans, finishes the rest, and scans
-- again. Questions 1 to 3 collide and are refused; 4 and 5 are new and record.
-- The second scan adds only the work that is new, which is exactly right and is
-- why the question number stays in the key rather than the whole Card being
-- refused on sight.

begin;

alter table kc_attempts
  add column if not exists task_id uuid;

comment on column kc_attempts.task_id is
  'The Card this answer belongs to. With capture_id it forms the identity of the work: one Card counted once, however many times it is photographed.';

-- Backfill from the session_task, which has carried it since BHCS-37.
update kc_attempts a
   set task_id = st.task_id
  from session_tasks st
 where st.id = a.session_task_id
   and st.task_id is not null
   and a.task_id is null;

drop index if exists kc_attempts_capture_kc_question_uniq;
drop index if exists kc_attempts_capture_kc_whole_uniq;

-- One answer per question per Room, per piece of work.
create unique index if not exists kc_attempts_work_question_uniq
  on kc_attempts (coalesce(task_id, capture_id), kc_id, question_number)
  where coalesce(task_id, capture_id) is not null and question_number is not null;

-- And one whole-Card verdict per piece of work, for the teacher-entry path
-- that has no question numbers.
create unique index if not exists kc_attempts_work_whole_uniq
  on kc_attempts (coalesce(task_id, capture_id), kc_id)
  where coalesce(task_id, capture_id) is not null and question_number is null;

create index if not exists kc_attempts_task_idx
  on kc_attempts (task_id) where task_id is not null;

commit;

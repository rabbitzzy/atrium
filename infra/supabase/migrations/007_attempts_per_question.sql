-- One attempt per question, not per page (BHCS-31)
--
-- BHCS-29 keyed the attempt ledger on `(capture_id, kc_id)`, which was right
-- for what it had to do: a child putting the same page under the camera twice
-- must not move their mastery twice.
--
-- It also fixed something the ticket did not intend. One capture could produce
-- exactly one attempt per Room, so a five-question Card had to collapse into a
-- single verdict before it could be recorded — and BHCS-31 asks for the
-- opposite, because "a per-question attempt per KC is more faithful than one
-- aggregate verdict per Card, and BKT is built to consume a sequence".
--
-- It is built to consume one because a sequence carries information an average
-- throws away. Four right then one wrong is a child who slipped at the end;
-- one wrong then four right is a child who worked out what was being asked.
-- Both average to 4/5.
--
-- So the grain of the ledger becomes the question, and idempotency is
-- preserved by putting the question number in the key rather than by having
-- only one row. A rescan of the same page still collides on every row it would
-- write, which is the property that mattered.
--
-- `question_number` is nullable, and null is not a gap. It means the attempt
-- was not a question on a Card — a teacher entering a result by hand, or the
-- single-verdict path the API still accepts. The partial unique index below
-- covers those separately so they never collide with each other.

begin;

alter table kc_attempts
  add column if not exists question_number int
    check (question_number is null or question_number > 0);

comment on column kc_attempts.question_number is
  'Which question on the Card produced this attempt. Null means the attempt did not come from a numbered question — a teacher entry, or a whole-Card verdict.';

-- Replaced rather than added to: the old index would reject the second
-- question of every Card.
drop index if exists kc_attempts_capture_kc_uniq;

create unique index if not exists kc_attempts_capture_kc_question_uniq
  on kc_attempts (capture_id, kc_id, question_number)
  where capture_id is not null and question_number is not null;

-- A whole-Card verdict still gets one row per (capture, Room), so re-scanning
-- a hand-graded page cannot double-count either.
create unique index if not exists kc_attempts_capture_kc_whole_uniq
  on kc_attempts (capture_id, kc_id)
  where capture_id is not null and question_number is null;

-- Reading a Card's attempts back in the order they were asked, which is what
-- makes the sequence legible to a teacher looking at why a number moved.
create index if not exists kc_attempts_capture_order_idx
  on kc_attempts (capture_id, kc_id, question_number);

commit;

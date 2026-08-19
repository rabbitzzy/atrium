-- Telling rehearsal apart from the real thing
--
-- Simulate mode exists so the loop can be exercised without spending paper: an
-- admin pretends to be the student, previews the Card on screen, and marks the
-- questions by hand. Everything downstream of the marking is the real code
-- path, which is the point — a rehearsal that takes a different route through
-- the system tests a different system.
--
-- But it writes to the same tables. Without a flag, a Floor plan would mix work
-- a child actually did with work an adult typed to check a button, and nobody
-- looking at Arthur's radar could tell which was which. That would quietly
-- corrupt the one thing this pilot exists to evaluate.
--
-- So every row a rehearsal produces says so, and can be removed without taking
-- real work with it.

begin;

alter table kc_attempts
  add column if not exists simulated boolean not null default false;

alter table print_events
  add column if not exists simulated boolean not null default false;

comment on column kc_attempts.simulated is
  'True when an adult marked this by hand in simulate mode rather than a child working a printed Card. Real evaluation must be able to exclude it.';

create index if not exists kc_attempts_simulated_idx
  on kc_attempts (student_id) where simulated;

commit;

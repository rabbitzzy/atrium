-- Earning a Leaf (BHCS-39)
--
-- The other half of the gate, flywheel step 8b: submitting a completed Card
-- earns +1, at any quality tier. A student whose work comes back `not-yet`
-- earns exactly as much as one who scores `mastered`, because the Leaf rewards
-- attempting and returning — the behaviour the flywheel needs — and
-- correctness is answered in the Debrief and in what gets assigned next. Tie
-- the credit to the score and the child who is struggling most gets the least
-- paper, which is precisely backwards.
--
-- ── The hole this closes ──
--
-- "Awarded on successful scan acceptance" is not by itself safe. Every scan is
-- a new capture, so a child who lays the same finished page under the camera
-- five times would earn five Leaves and print five Cards from one piece of
-- work. Not malice — a six-year-old who is not sure the first one worked does
-- exactly this, and BHCS-29 added idempotency for that precise habit.
--
-- So the award is keyed on the Card, not the capture. A task can be earned
-- from once, ever, and the partial unique index below is what says so — not a
-- check in the service, which two simultaneous scans could both pass.
--
-- This is also why an earn needs a Card at all. A worksheet with no QR is
-- still graded and still gets a Debrief; it just cannot be told apart from the
-- same page scanned again, so it earns nothing. Paper the station did not
-- print is paper it cannot account for.

begin;

alter table print_events
  add column if not exists task_id uuid;

comment on column print_events.task_id is
  'The Card this event concerns. Set on earn events so a Card can only ever be earned from once; null for grants, spends and bootstraps.';

-- One earn per Card, enforced where it cannot be raced.
create unique index if not exists print_events_earn_per_task_uniq
  on print_events (task_id)
  where event_type = 'earn' and task_id is not null;

/**
 * Award the Leaf for a submitted Card.
 *
 * Returns `{ balance, granted, capped }`:
 *   granted 0 + capped true   — already at the ceiling; the child submitted and
 *                               is simply full, which the kiosk must say as
 *                               abundance rather than as a rejected transaction
 *   granted 0 + capped false  — this Card has already been earned from
 *   granted 1                 — the ordinary case
 *
 * The three are kept apart because they are three different sentences to a
 * child, and collapsing them into "nothing happened" is how a rule starts
 * feeling arbitrary.
 */
create or replace function earn_leaf(
  p_student_id text,
  p_task_id    uuid,
  p_session_id uuid default null
)
returns json
language plpgsql
as $$
declare
  v_balance int;
  v_ceiling int := 5;
begin
  insert into student_print_state (student_id, leaf_balance, lifetime_earned, lifetime_spent)
  values (p_student_id, 0, 0, 0)
  on conflict (student_id) do nothing;

  select leaf_balance into v_balance
  from student_print_state
  where student_id = p_student_id
  for update;

  if exists (select 1 from print_events
              where task_id = p_task_id and event_type = 'earn') then
    return json_build_object('balance', v_balance, 'granted', 0, 'capped', false);
  end if;

  if v_balance >= v_ceiling then
    -- Deliberately no event. An event for a Leaf that never landed would make
    -- the ledger disagree with the balance, which is the one thing the Leaf
    -- functions exist to prevent. The Card stays un-earned, so if the student
    -- spends down and rescans it, they get it then.
    return json_build_object('balance', v_balance, 'granted', 0, 'capped', true);
  end if;

  update student_print_state
     set leaf_balance    = leaf_balance + 1,
         lifetime_earned = lifetime_earned + 1,
         updated_at      = now()
   where student_id = p_student_id;

  insert into print_events (student_id, session_id, task_id, event_type, amount, reason)
  values (p_student_id, p_session_id, p_task_id, 'earn', 1, 'submission');

  return json_build_object('balance', v_balance + 1, 'granted', 1, 'capped', false);
end;
$$;

comment on function earn_leaf is
  'Atomically award the Leaf for submitting a Card. Idempotent per task: a Card can be earned from once.';

commit;

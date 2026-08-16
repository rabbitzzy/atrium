-- The Leaf gate, as one indivisible act (BHCS-38)
--
-- The rule the whole eco design rests on: a student earns the right to print
-- their next Card by turning in the current one. Its acceptance has a clause
-- that decides the implementation — "every balance change has a matching
-- print_events row and the two never disagree".
--
-- Two statements from a service cannot promise that. The balance updates, the
-- process dies, and the ledger is short a row: a Leaf has vanished with nothing
-- recording where it went, which is precisely the accusation the audit trail
-- exists to answer. Worse, a plain read-then-write cannot promise the balance
-- either — two requests both read 1, both decide they may print, both write 0,
-- and one sheet of paper came out free.
--
-- So spending and granting are database functions. The row is locked, the
-- balance and the event move together or not at all, and concurrency is the
-- database's problem rather than a race the service hopes not to lose.
--
-- ── The floor is an invariant, not a clamp ──
--
-- `leaf_balance` already carries `check (leaf_balance between 0 and 5)` from
-- 001, and nothing here weakens it. A function that tried to overdraw would not
-- write a negative number, it would raise — because there is no path in the
-- design that should ever want to, and silently clamping one would hide the bug
-- that produced it.
--
-- ── What is deliberately not here ──
--
-- No refund function. BHCS-38 asks the question outright: "how does the system
-- learn a print *failed*? If nothing reports it, the refund event is
-- unreachable code." Nothing reports it. BHCS-67 — the printer and how a
-- browser reaches it — is not built, and a Vercel function knows only that it
-- returned a PDF, never that paper came out of a tray.
--
-- So the honest v1 answer, written down rather than shipped as dead code: the
-- recovery for a failed print is a teacher granting a Leaf (BHCS-47), which is
-- also the escape hatch `eco-design.md` already names and the one that leaves
-- an audit trail. `print_events.event_type` still permits 'refund' so the
-- ledger can express one the day something can trigger it.
--
-- And no pay-to-print, no parent override, no admin bypass. Not omitted for
-- later — never built.

begin;

/**
 * Spend one Leaf. Returns the new balance, or -1 if there was nothing to spend.
 *
 * -1 rather than an exception because "this child has no Leaves" is an ordinary
 * answer the kiosk renders as a screen, not a fault. Actually overdrawing would
 * be a fault, and the check constraint would raise.
 */
create or replace function spend_leaf(p_student_id text, p_session_id uuid default null)
returns int
language plpgsql
as $$
declare
  v_balance int;
begin
  -- The lock is the whole point: two simultaneous prints must not both see the
  -- last Leaf. A student with no row has never been bootstrapped and has
  -- nothing to spend.
  select leaf_balance into v_balance
  from student_print_state
  where student_id = p_student_id
  for update;

  if not found or v_balance < 1 then
    return -1;
  end if;

  update student_print_state
     set leaf_balance   = leaf_balance - 1,
         lifetime_spent = lifetime_spent + 1,
         updated_at     = now()
   where student_id = p_student_id;

  insert into print_events (student_id, session_id, event_type, amount, reason)
  values (p_student_id, p_session_id, 'spend', 1, 'card_printed');

  return v_balance - 1;
end;
$$;

/**
 * Grant Leaves, respecting the ceiling. Returns the new balance.
 *
 * The ceiling is why the event records what was actually applied rather than
 * what was asked for: a student at 5 who submits does not go to 6, and writing
 * an event for a Leaf that never landed would make the ledger disagree with the
 * balance — the one thing this file exists to prevent. Granted nothing, records
 * nothing.
 */
create or replace function grant_leaves(
  p_student_id text,
  p_amount     int,
  p_reason     text,
  p_granted_by text default null,
  p_event_type text default 'grant'
)
returns int
language plpgsql
as $$
declare
  v_balance int;
  v_ceiling int := 5;
  v_applied int;
begin
  if p_amount <= 0 then
    raise exception 'grant_leaves: amount must be positive, got %', p_amount;
  end if;

  insert into student_print_state (student_id, leaf_balance, lifetime_earned, lifetime_spent)
  values (p_student_id, 0, 0, 0)
  on conflict (student_id) do nothing;

  select leaf_balance into v_balance
  from student_print_state
  where student_id = p_student_id
  for update;

  v_applied := least(p_amount, v_ceiling - v_balance);
  if v_applied <= 0 then
    return v_balance;
  end if;

  update student_print_state
     set leaf_balance    = leaf_balance + v_applied,
         lifetime_earned = lifetime_earned + v_applied,
         updated_at      = now()
   where student_id = p_student_id;

  insert into print_events (student_id, event_type, amount, reason, granted_by)
  values (p_student_id, p_event_type, v_applied, p_reason, p_granted_by);

  return v_balance + v_applied;
end;
$$;

comment on function spend_leaf is
  'Atomically spend one Leaf and log it. Returns the new balance, or -1 when there was none to spend.';
comment on function grant_leaves is
  'Atomically grant Leaves up to the ceiling and log what was actually applied. Returns the new balance.';

commit;

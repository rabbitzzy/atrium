-- Local development seed. Never applied to a deployed database.
--
-- BHCS owns student identity (CLAUDE.md), and api/students.ts reads it via the
-- BHCS_SUPABASE_* client. Locally there is no portal to read from, and db.ts
-- falls back to the Atrium client when those vars are unset — so this stands up
-- a table with the same shape as the portal's `students` and fills it with
-- obvious fakes.
--
-- This lives in seed.sql rather than a migration on purpose: it must never
-- become part of Atrium's real schema, because Atrium does not own this data.

create table if not exists students (
  id          uuid primary key default gen_random_uuid(),
  first_name  text not null,
  last_name   text not null,
  active      boolean not null default true
);

-- Names are deliberately not real students. Includes a mix of name lengths so
-- the check-in search filter gets exercised, and one inactive row to prove the
-- active filter in api/students.ts works.
--
-- The insert is wrapped in a DO block because the CLI sends this file as a
-- single batch: every statement is described up front, before any has run, so
-- a bare INSERT here fails to resolve `students` even though the CREATE TABLE
-- precedes it. Inside a DO block the body is an opaque string at describe
-- time and only resolves on execution, by which point the table exists.
do $$
begin
  if not exists (select 1 from students) then
    insert into students (first_name, last_name, active) values
      ('Test',     'Student',  true),
      ('Alex',     'Chen',     true),
      ('Maya',     'Li',       true),
      ('Jordan',   'Nakamura', true),
      ('Sam',      'Okonkwo',  true),
      ('Inactive', 'Example',  false);
  end if;
end $$;

-- Post-processing output for captures (BHCS-12)
--
-- A capture app may declare a `refine` step that runs after extraction: pure
-- logic over what the model read, server-side, before the row is finalised.
-- The chess app is the first to have one — it resolves handwritten move text
-- against the board — but nothing here is about chess, and nothing here should
-- become about chess. These columns belong to the platform's pipeline, the
-- same way ocr_json does.
--
-- The invariant this migration exists to protect: refinement never overwrites
-- the extraction. `ocr_json` keeps the verbatim transcription — what the child
-- actually wrote, misspellings and all — because that is the teacher's audit
-- trail and the only evidence of what was really on the paper. What the system
-- decided it meant lives beside it, never on top of it.

alter table captures
  -- Shape depends on kind, exactly as ocr_json does:
  --   chess -> { metadata, moves: [{n, side, raw, san, uci, status}], counts, confidence }
  -- Null means no refinement has run.
  add column refined_json jsonb,

  -- Mirrors ocr_status, and moves independently of it: refinement can fail on
  -- a perfectly good transcription, and a capture with no refine step at all
  -- is 'skipped', not a failure.
  add column refined_status text
    check (refined_status in ('pending', 'ok', 'failed', 'skipped')),

  -- Kept separate from ocr_error on purpose. Conflating "the model could not
  -- read the page" with "the validator threw" makes a row unreadable at
  -- exactly the moment someone is trying to work out which one happened.
  add column refined_error text;

comment on column captures.refined_json is
  'Post-processing output from the capture app''s refine step. Never replaces ocr_json.';

-- Finding what still needs refining is the backfill''s only query, and the
-- partial index keeps it cheap as the table grows.
create index on captures (kind, captured_at desc)
  where refined_json is null;

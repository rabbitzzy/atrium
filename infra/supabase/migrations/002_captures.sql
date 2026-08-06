-- Atrium capture platform
--
-- A "capture" is any image taken at the kiosk station: a completed worksheet,
-- a chess scoresheet, or a student's doodle. Every capture is persisted to
-- Google Drive (durable, human-browsable) and indexed here (queryable).
--
-- This table is deliberately generic. The flywheel-specific tables in 001
-- (session_tasks, feedback_reports) model the *pedagogical* loop; this one
-- models the *ingestion* loop and is the substrate the pipelines run on.

create table captures (
  id            uuid primary key default gen_random_uuid(),

  -- Who. student_id is the BHCS portal students.id (uuid), stored as text so
  -- this table has no cross-project FK. student_name is denormalized on
  -- purpose: the portal is the source of truth, but a capture must stay
  -- readable years later even if the roster row is renamed or removed.
  student_id    text not null,
  student_name  text not null,

  -- What kind of thing was captured. Drives which pipeline runs.
  kind          text not null check (kind in ('worksheet', 'chess', 'doodle')),

  -- Where the original image lives. The storage backend is the system of
  -- record for pixels; this table only keeps pointers. storage_id is
  -- backend-specific — a Drive file id, or a path relative to the local root —
  -- so storage_backend is what tells you how to interpret it.
  storage_backend text not null check (storage_backend in ('drive', 'local')),
  storage_id      text not null,
  storage_url     text not null,
  mime_type       text not null default 'image/jpeg',
  bytes           int  not null,

  -- What was cropped out of the camera frame before storing and OCR'ing:
  -- { paper, orientation, rect{x,y,width,height}, source{w,h}, output{w,h} }.
  -- Kept because OCR quality questions are usually framing questions, and
  -- without this you cannot tell a bad transcription from a clipped page.
  crop_json       jsonb,

  -- Pipeline output. Shape depends on kind:
  --   worksheet -> { questions: [...], overall_quality, summary_en, summary_zh }
  --   chess     -> { metadata: {...}, moves: [{n, w, b}, ...] }   (chess-karma shape)
  --   doodle    -> null (stored only, never OCR'd)
  ocr_json      jsonb,

  -- Pipeline lifecycle. 'skipped' is a success state for doodles.
  ocr_status    text not null default 'pending'
                check (ocr_status in ('pending', 'ok', 'failed', 'skipped')),
  ocr_error     text,
  ocr_model     text,
  ocr_ms        int,

  captured_at   timestamptz not null default now()
);

create index on captures (student_id, captured_at desc);
create index on captures (kind, captured_at desc);
create index on captures (ocr_status) where ocr_status in ('pending', 'failed');

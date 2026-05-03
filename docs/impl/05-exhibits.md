# Exhibits — Creative Contributions

Package touches: `packages/skill-graph`, `packages/evaluator`, `packages/worksheet`, `packages/kiosk`  
New migration: `infra/supabase/migrations/002_exhibits.sql`

## What this is

An **Exhibit** is any creative work a student scans — drawing, comic strip, handwritten story, mixed — that is **not** a graded worksheet submission. Exhibits are persisted with the student's identity, visible to parents via the portal's Gallery view, and feed a per-student **interest profile** that the task generator uses for problem theming.

Two modes:
- **Assigned** — the AI gave the student a creative Card (e.g. "draw a comic showing equivalent fractions"). Submitted via the normal scan flow; earns 1 Leaf on submission.
- **Free-form** — student scans something they made on their own, outside any task. No Leaf cost; no Leaf earned. Quick scan, fast acknowledgment, done.

The word "Exhibit" earns its place in the naming system: an atrium is a space where things are displayed; students contribute to their own exhibit inside it.

---

## Migration: `002_exhibits.sql`

```sql
-- Exhibits: creative contributions (assigned or free-form)
create table exhibits (
  id            uuid primary key default gen_random_uuid(),
  student_id    text not null,
  session_id    uuid references sessions(id),
  task_id       uuid references tasks(id),         -- null if free-form
  is_assigned   boolean not null default false,
  raw_png_url   text not null,                     -- S3 / Supabase Storage
  metadata      jsonb,                             -- populated by evaluator async
  visible_to_parent boolean not null default true,
  created_at    timestamptz not null default now()
);

create index on exhibits (student_id, created_at desc);
create index on exhibits (session_id);

-- Interest profile: derived summary of a student's creative themes
-- Maintained as a JSONB blob; updated each time an exhibit is processed.
-- Kept separate from students table so updates don't touch the BHCS-synced record.
create table student_interest_profiles (
  student_id     text primary key,
  themes         text[]   not null default '{}',    -- ["dinosaurs","soccer"] frequency-ranked top 10
  characters     text[]   not null default '{}',    -- invented character names, up to 5
  preferred_lang text,                              -- "zh" | "en" | "mixed" | null
  updated_at     timestamptz not null default now()
);
```

**Note:** `tasks` gets a new `task_type` column in a separate migration when creative Cards are fully scheduled. For now, the `is_assigned` flag on `exhibits` is sufficient.

---

## Evaluator — new endpoint: `POST /extract-exhibit`

Same service (`packages/evaluator`), second pipeline branch. No rubric, no BKT update.

```
Input: { studentId, sessionId, taskId?, imageUrl }
         │
         ▼
1. Download image from imageUrl
         │
         ▼
2. Call Claude Haiku (vision) with extraction prompt
   → structured ExhibitMetadata JSON
         │
         ▼
3. PATCH exhibits/:id with metadata
         │
         ▼
4. Merge metadata into student_interest_profiles (upsert)
         │
         ▼
5. If is_assigned: POST to skill-graph /students/:id/earn-leaf { reason: "exhibit_submission" }
         │
         ▼
Output: ExhibitMetadata
```

### ExhibitMetadata schema (Pydantic)

```python
from typing import Literal
from pydantic import BaseModel

class ExhibitMetadata(BaseModel):
    themes: list[str]        # 1–5 concrete subjects depicted ("dinosaurs", "soccer", "家")
    characters: list[str]    # named characters the student invented; empty list if none
    text_detected: bool
    language: Literal["zh", "en", "mixed", "none"]
    kc_hints: list[str]      # KC ids this work plausibly relates to; empty if none obvious
    description_en: str      # 1 sentence, parent-gallery caption
    description_zh: str      # same in Chinese
    mood: Literal["playful", "serious", "imaginative", "expressive", "unclear"]
```

### LLM extraction call

Model: **`claude-haiku-4-5-20251001`** — this is metadata extraction, not grading; cost matters at scale.

```python
EXTRACTION_SYSTEM = """\
You analyze children's creative work (ages 5–11) from a bilingual Chinese-English school.
The work may be a drawing, comic, handwritten story, or mixed media.
Extract structured metadata. Be generous and literal — these are elementary schoolers.
Return valid JSON matching the schema exactly. No extra fields, no markdown fences.\
"""

# System prompt sent with cache_control so it's cached across all extraction calls.
# User turn: base64 image + minimal context.
```

Full call (Python, Anthropic SDK):

```python
import anthropic, base64, json
from pathlib import Path

client = anthropic.Anthropic()

def extract_exhibit(image_bytes: bytes, student_age: int) -> ExhibitMetadata:
    b64 = base64.standard_b64encode(image_bytes).decode()
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        system=[{
            "type": "text",
            "text": EXTRACTION_SYSTEM,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": "image/png", "data": b64},
                },
                {
                    "type": "text",
                    "text": f"Student age: {student_age}. Extract metadata as JSON.",
                },
            ],
        }],
    )
    raw = response.content[0].text.strip()
    return ExhibitMetadata.model_validate_json(raw)
```

### Interest profile merge

```python
def merge_interest_profile(
    current: dict, metadata: ExhibitMetadata
) -> dict:
    # Merge themes: deduplicate, keep top 10 by recency (new themes prepended)
    merged_themes = list(dict.fromkeys(metadata.themes + current.get("themes", [])))[:10]
    merged_chars  = list(dict.fromkeys(metadata.characters + current.get("characters", [])))[:5]
    lang = metadata.language if metadata.language != "none" else current.get("preferred_lang")
    return {
        "themes": merged_themes,
        "characters": merged_chars,
        "preferred_lang": lang,
        "updated_at": datetime.utcnow().isoformat(),
    }
```

---

## Skill-graph service — new routes

```
POST /students/:id/exhibits
  Body: { sessionId?, taskId?, isAssigned, rawPngUrl }
  → creates exhibits row, queues extraction job
  → returns { exhibitId }

GET  /students/:id/exhibits
  Query: ?limit=20&before=<timestamp>
  → returns exhibits list (for parent gallery); metadata included once populated

GET  /students/:id/interest-profile
  → returns student_interest_profiles row or {} if no exhibits yet
```

The Leaf earn for assigned exhibits flows through the existing `POST /students/:id/print-events` route with `{ event_type: "earn", reason: "exhibit_submission" }` — no new route needed.

---

## Worksheet generator — interest profile context

`POST /generate` now fetches the student's interest profile from skill-graph before calling Claude. The profile is injected into the problem-generation prompt as a soft constraint:

```typescript
// In generateProblems(), after fetching the interest profile:
const interestHint = profile.themes.length > 0
  ? `Student's favorite themes (use for problem context if it fits naturally, never force it): ${profile.themes.slice(0, 3).join(", ")}. ` +
    (profile.characters.length > 0 ? `Known characters they've invented: ${profile.characters[0]}.` : "")
  : "";

// Prepend to the user message, not the cached system prompt:
const userMessage = `${interestHint}\nKCs: ${kcIds.join(", ")}. Difficulty: ${difficulty}. Generate ${count} problems.`;
```

This is a **soft** hint — the problem generator may ignore it when the theme doesn't fit the KC. The system prompt rubric remains unchanged.

---

## Kiosk — free-form scan flow

The kiosk gains a small secondary button on the post-check-in home screen: **"Share a drawing"** (EN) / **"分享我的画"** (ZH). It does not appear mid-task.

Flow:
1. Student taps button → camera activates (same hardware path as worksheet submission)
2. Camera captures image → uploaded to Supabase Storage
3. Kiosk calls `POST /students/:id/exhibits` with `isAssigned: false`
4. Kiosk shows: **"Got it! Your drawing is saved to your Gallery."** — 2 seconds, then returns to home
5. Extraction runs async in the evaluator; kiosk does not wait for it

For **assigned creative tasks**, the submission flow is identical to worksheet submission except:
- The evaluator routes to `/extract-exhibit` instead of the rubric grader
- The kiosk shows the Debrief screen with the description extracted (not a quality tier)
- 1 Leaf is earned

---

## Parent portal — Gallery view

The parent portal (BHCS portal, `rabbitzzy/bhcs`) adds a Gallery tab to the student detail page. Data source: `GET /students/:id/exhibits` from the skill-graph API.

Each Exhibit card shows:
- Thumbnail (raw_png_url, cropped to square)
- `metadata.description_en` / `metadata.description_zh` caption (toggle)
- Date of session
- Tag chips for top 2 themes

The Gallery is chronological (newest first), paginated at 20. Teachers see the same view with an additional "hide from parent" toggle per Exhibit (sets `visible_to_parent = false`).

---

## What this does NOT do (v1 scope)

- **No creative KCs tracked** — `lang/zh/creative-writing` or `art/illustration` are real skills but adding them to the Blueprint is v2. For now, `kc_hints` in metadata is advisory and not used for BKT updates.
- **No Exhibit printing** — students cannot spend a Leaf to print a copy of their Exhibit in v1. The printer is for Cards. Add this if students ask for it.
- **No AI feedback on free-form Exhibits** — no "good drawing!" response from the Docent. The Debrief screen is only shown for assigned creative tasks.
- **No Exhibit editing or deletion by students** — parents and teachers can hide; students cannot delete. This is intentional: the Gallery is a record, not a portfolio students curate.

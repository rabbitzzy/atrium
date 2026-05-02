# Atrium

A self-serve AI learning hub for Bright Horizon Chinese School. Students rotate through a shared kiosk — scanner, monitor, printer, microphone — and get a personalized loop: assess → assign → work → submit → reflect → re-plan.

## The flywheel

```
Bootstrap eval → Plan task → Print worksheet → Student works
      ↑                                                ↓
Update skill tree ← Generate report ← AI evaluates ← Scan submission
```

## Repository layout

```
packages/
  kiosk/         React kiosk frontend (check-in, chat, scan-submit)
  skill-graph/   Skill tree + BKT student state service (TypeScript/Node)
  worksheet/     Worksheet generator — PDF with QR header (TypeScript/Node)
  evaluator/     Submission evaluator — OCR + LLM grading (Python)
docs/
  01-codenames.md          Name rationale (Atrium chosen)
  02-market-research.md    Competitive landscape and open-source analogs
  03-teacher-direction.md  Teacher trust runway (observer → collaborator → multiplier)
  impl/                    Per-service implementation plans
infra/
  supabase/migrations/     Database schema migrations
```

## Domain vocabulary

| Term | Meaning |
|------|---------|
| Room | A knowledge component (KC) — atomic skill node |
| Blueprint | The dynamic skill tree (DAG of Rooms) |
| Floor plan | A student's current mastery state across all Rooms |
| The Docent | The AI assistant persona — present, contextual, transparent |
| Visit | A kiosk session |
| Card | A printed worksheet |
| The Debrief | The per-session feedback report |
| The Landing | A student's frontier KCs — not too easy, not too hard |

## Quick start

```bash
pnpm install          # install all workspace dependencies
pnpm -F kiosk dev     # start kiosk frontend on :5173
pnpm -F skill-graph dev   # start skill-graph API on :3001
pnpm -F worksheet dev     # start worksheet generator on :3002
```

Python evaluator:
```bash
cd packages/evaluator
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn src.main:app --reload --port 3003
```

## Integration with BHCS portal

Student identity, parent visibility, and wallet/credits all live in `rabbitzzy/bhcs`. Atrium reads student profiles from the portal API and pushes session reports back. It does not hold passwords or PII independently.

## Tech stack

- **LLM:** Claude Sonnet 4.6 / Opus 4.7 (Anthropic API), Gemini Flash fallback
- **Student model:** pyBKT (Bayesian Knowledge Tracing), defer DKT until ≥10K logs
- **Voice:** Whisper STT + OpenAI TTS (kid-friendly bilingual)
- **Frontend:** React + Vite + TypeScript, inline styles, DM Sans font
- **Backend:** Node/TypeScript (Hono), Python (FastAPI)
- **Database:** Supabase Postgres
- **Worksheet rendering:** HTML → headless Chromium → PDF

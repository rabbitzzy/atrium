# Submission Evaluator — Implementation Plan

Package: `packages/evaluator`  
Tech: FastAPI (Python), Anthropic SDK, Pillow  
Port: 3003

## Responsibility
Receive a scan of a completed worksheet, evaluate it against the task rubric, return a structured Debrief, and update the skill-graph service.

## POST /submit — pipeline

```
Input: { scan: image bytes, studentId, taskId }
         │
         ▼
1. Decode QR code from scan header → verify { studentId, taskId } match
         │
         ▼
2. (Optional) Crop answer regions by line index (Phase 2+; Phase 1: send full image)
         │
         ▼
3. Call Claude claude-sonnet-4-6 (vision) with:
   - System prompt (cached): grading persona + output schema
   - User message: base64 image + "Task ID: {taskId}"
         │
         ▼
4. Parse JSON response → EvaluationResult
         │
         ▼
5. POST to skill-graph /students/:id/attempt
   (updates BKT state, creates feedback_report row)
         │
         ▼
6. (Optional) Generate Debrief PDF and store → return { debriefUrl }
```

## EvaluationResult schema

```python
class QuestionResult(BaseModel):
    number: int
    quality: Literal["mastered", "shaky", "needs-help", "not-yet"]
    transcript: str          # what the model read from handwriting
    misconception: str | None
    suggestion: str | None   # bilingual, age-appropriate

class EvaluationResult(BaseModel):
    student_id: str
    task_id: str
    questions: list[QuestionResult]
    overall_quality: Literal["mastered", "shaky", "needs-help", "not-yet"]
    summary_en: str
    summary_zh: str
    next_focus: str          # KC or skill area
    debrief_url: str | None
```

## LLM call design

- Model: `claude-sonnet-4-6` (vision-capable, structured output reliable)
- System prompt sent with `cache_control: { "type": "ephemeral" }` — cached across all evaluations
- Max tokens: 2048 (sufficient for 5 questions + summaries)
- Temperature: 0 for deterministic grading
- If malformed JSON: strip markdown fences and retry parse; if still invalid, return 422 with raw response for debugging

## Accuracy notes (from docs/02-market-research.md)
- Claude / GPT-4o / Gemini achieve 97–99% transcription accuracy on clean K-5 handwriting
- Multimodal LLM grading ≥90% F1 on simple math problems vs teacher
- Phase 1: send full-page image; Phase 2: crop answer regions per template for higher accuracy on multi-problem sheets

## Latency target
End-to-end (scan upload → EvaluationResult returned): ≤ 30 seconds.  
Practical breakdown:
- Image upload: ~1s (local network)
- Claude vision API: ~8–15s (claude-sonnet-4-6)
- BKT update + DB write: ~1s
- Debrief PDF render (future): ~3s

If latency exceeds 25s, add a streaming progress endpoint so the kiosk can show "Evaluating… ✓ Transcribing → ✓ Grading → ✓ Planning next step".

## Environment variables

```
ANTHROPIC_API_KEY=
SKILL_GRAPH_URL=http://localhost:3001
PORT=3003
```

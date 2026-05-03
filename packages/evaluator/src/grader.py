import base64
import json
from pydantic import BaseModel
import anthropic

client = anthropic.Anthropic()

GRADER_SYSTEM = """You are the Docent, an AI evaluator for a bilingual K-5 learning hub.

You receive an image of a completed student worksheet and a rubric.
You return a JSON object matching this schema exactly:
{
  "questions": [
    {
      "number": <int>,
      "quality": "<mastered|shaky|needs-help|not-yet>",
      "transcript": "<what you read in the student's handwriting, or 'blank' if empty>",
      "misconception": "<one-sentence description of the error, or null if correct>",
      "suggestion": "<one short, encouraging bilingual EN+ZH suggestion, or null if correct>"
    }
  ],
  "overall_quality": "<mastered|shaky|needs-help|not-yet>",
  "summary_en": "<2-3 sentences for the student, encouraging and specific>",
  "summary_zh": "<same in Chinese>",
  "next_focus": "<the KC or skill area to target next>"
}

Be age-appropriate: encouraging, specific, never shaming.
If handwriting is unclear, do your best to read it and note the uncertainty in the transcript field.
"""

V0_TASK_RUBRIC = """
This worksheet is task-v0-001 with exactly 5 numbered problems:

1. Three-digit addition: 247 + 385 = ___   (correct answer: 632)
2. Subtraction with borrowing: 502 − 278 = ___   (correct answer: 224)
3. Multiplication: 8 × 7 = ___   (correct answer: 56)
4. Fraction addition: 1/3 + 1/6 = ___   (correct answer: 1/2, also accept 3/6 or 0.5)
5. Word problem (bilingual): Xiao Ming had 24 apples, gave 8 to a friend, then bought 15 more. How many now?   (correct answer: 31)

Each problem has a bordered answer box below the question text. Read the student's answer from inside that box.
Grade each one and return all 5 in the "questions" array in order.
"""


def get_task_rubric(task_id: str) -> str:
    if task_id.startswith("task-v0"):
        return V0_TASK_RUBRIC
    return "Identify each problem on the worksheet and evaluate the student's handwritten answers based on what you can see."


class QuestionResult(BaseModel):
    number: int
    quality: str
    transcript: str
    misconception: str | None
    suggestion: str | None


class EvaluationResult(BaseModel):
    student_id: str
    task_id: str
    questions: list[QuestionResult]
    overall_quality: str
    summary_en: str
    summary_zh: str
    next_focus: str
    debrief_url: str | None = None


async def grade_submission(
    image_bytes: bytes,
    student_id: str,
    task_id: str,
) -> EvaluationResult:
    b64 = base64.standard_b64encode(image_bytes).decode()

    rubric = get_task_rubric(task_id)

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=[
            {
                "type": "text",
                "text": GRADER_SYSTEM,
                # Cache the static system prompt across all evaluation calls.
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": f"Task ID: {task_id}\n\nRubric:\n{rubric}\n\nPlease evaluate this student's worksheet.",
                    },
                ],
            }
        ],
    )

    raw = response.content[0].text if response.content else "{}"
    # Strip markdown code fences if the model wraps in ```json … ```
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0]

    parsed = json.loads(raw)
    questions = [QuestionResult(**q) for q in parsed.get("questions", [])]

    return EvaluationResult(
        student_id=student_id,
        task_id=task_id,
        questions=questions,
        overall_quality=parsed.get("overall_quality", "not-yet"),
        summary_en=parsed.get("summary_en", ""),
        summary_zh=parsed.get("summary_zh", ""),
        next_focus=parsed.get("next_focus", ""),
    )

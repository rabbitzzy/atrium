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
      "transcript": "<what you read in the student's handwriting>",
      "misconception": "<one-sentence description of the error, or null>",
      "suggestion": "<one short, encouraging suggestion for the student, bilingual EN+ZH, or null>"
    }
  ],
  "overall_quality": "<mastered|shaky|needs-help|not-yet>",
  "summary_en": "<2-3 sentences for the student>",
  "summary_zh": "<same in Chinese>",
  "next_focus": "<the KC or skill area to target next>"
}

Be age-appropriate: encouraging, specific, never shaming.
"""


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
                        "text": f"Task ID: {task_id}\nPlease evaluate this student's worksheet.",
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

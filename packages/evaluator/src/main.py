from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parents[3] / '.env')  # repo root .env

from fastapi import FastAPI, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .grader import grade_submission, EvaluationResult

app = FastAPI(title="Atrium Evaluator", version="0.0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/submit", response_model=EvaluationResult)
async def submit(
    scan: UploadFile,
    studentId: str = Form(...),
    taskId: str = Form(...),
):
    """Receive a worksheet scan, evaluate it, and return a structured Debrief."""
    image_bytes = await scan.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty scan")

    result = await grade_submission(
        image_bytes=image_bytes,
        student_id=studentId,
        task_id=taskId,
    )
    return result

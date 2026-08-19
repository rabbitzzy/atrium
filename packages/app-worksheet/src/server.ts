/**
 * Worksheet — server half.
 *
 * The one worksheet grader (BHCS-23). A second one lived in Python behind a UI
 * route that no longer existed; its shape is preserved here because rows in
 * `captures.ocr_json` were written to it and a stored value that changes
 * meaning is worse than an awkward field name.
 */

import type { CaptureAppServer, CaptureContext, GeminiSchema, RecordArgs } from '@atrium/schema'
import { readingLevelBrief } from './reading-level'
import { isRecordable, toObservations, type GradedQuestion } from './attempts'
import { guard } from './guard'

const WORKSHEET_SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    /*
     * BHCS-22. Asked first, and answered before anything is graded.
     *
     * `propertyOrdering` puts it at the front so the streaming path learns the
     * answer before a single question arrives — and so the model itself commits
     * to whether the page is gradeable before it has written four gradings and
     * has an answer to be consistent with.
     */
    is_worksheet: {
      type: 'BOOLEAN',
      description:
        'True only if this page is a worksheet, exercise sheet or test with questions on it. False for a drawing, a blank page, a photograph of a desk, a book, or anything else.',
    },
    not_worksheet_reason: {
      type: 'STRING',
      nullable: true,
      description: 'When is_worksheet is false, what the page actually appears to be.',
    },
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          number: { type: 'INTEGER' },
          quality: { type: 'STRING', enum: ['mastered', 'shaky', 'needs-help', 'not-yet'] },
          transcript: { type: 'STRING', description: "The student's answer, transcribed verbatim" },
          misconception: { type: 'STRING', nullable: true },
          suggestion: { type: 'STRING', nullable: true },
        },
        required: ['number', 'quality', 'transcript'],
        propertyOrdering: ['number', 'quality', 'transcript', 'misconception', 'suggestion'],
      },
    },
    overall_quality: { type: 'STRING', enum: ['mastered', 'shaky', 'needs-help', 'not-yet'] },
    summary_en: { type: 'STRING' },
    summary_zh: { type: 'STRING' },
    next_focus: { type: 'STRING' },
  },
  required: ['is_worksheet', 'questions', 'overall_quality', 'summary_en', 'summary_zh', 'next_focus'],
  propertyOrdering: [
    'is_worksheet',
    'not_worksheet_reason',
    'questions',
    'overall_quality',
    'summary_en',
    'summary_zh',
    'next_focus',
  ],
}

/**
 * What the job is, for every student. Everything that varies by who handed the
 * page over lives in `reading-level.ts` and is appended below.
 */
const WORKSHEET_PROMPT = `You evaluate completed worksheets from a bilingual Chinese-English learning hub.

── First, decide whether this is a worksheet at all ──

Before anything else, set is_worksheet. It is true only for a page with
questions on it: a worksheet, an exercise sheet, a test.

It is false for a drawing, a painting, a blank sheet, a photograph of a desk or
a hand, a page from a storybook, or anything else a child might put under the
camera. When it is false, say what the page appears to be in
not_worksheet_reason, return an empty questions array, and stop. Do not invent
questions, do not grade, and do not write encouraging summaries about what a
lovely drawing it is.

This matters more than it looks. A child who puts the wrong page down and gets
back confident feedback about questions that were never on it has been told
something false about their own work, and nothing in the system will catch it.
An honest "this is a drawing" costs them one retry. A fabricated grade costs
them the truth.

A part-finished worksheet is still a worksheet. Most of the page being blank is
what an unfinished page looks like, not what a non-worksheet looks like.

── If it is a worksheet, grade it ──

Transcribe each answer exactly as written, then judge it. When handwriting is
genuinely unclear, transcribe your best reading and say so in the misconception
field rather than guessing silently — a flagged uncertainty is useful to a
teacher, a confident wrong transcription is not.

Feedback is read by a child. Write it warmly and specifically. Name what the
student did, not what they failed to do.

── Who you are writing to ──

You are talking to the child who filled this page in, and they are standing at
the machine reading your words a few seconds after handing it over. Write every
misconception, every suggestion, and both summaries as speech directed at them.

Say "you", never "the student" and never their number. "You split 24 into 20 and
4, then added the 20s" is the register. "The student demonstrates partial
understanding of place value" is a sentence about a child, written past them to
an adult, and it does not belong in a field they read.

Talk the way a patient person sitting beside them would. Short sentences.
Contractions are fine. You may ask them a real question — "what happens if you
try it with 10 first?" — as long as it is a question they can act on with the
pencil already in their hand, not a rhetorical one.

Two things this is not. It is not chatter: every sentence still has to carry the
specific thing they did, and warmth added on top of a vague finding is worse than
no warmth at all. And it is not praise inflation: "you got it" is for answers
they got, and a child who is told everything is wonderful stops believing the
part that is.

When an answer is wrong, say so plainly and immediately, then say the useful
thing. Burying it under a compliment costs them the one sentence they needed.`

/**
 * The prompt for one particular child (BHCS-14).
 *
 * "TK-5" is gone from the first line: it named a seven-year span and then asked
 * for age-appropriateness inside it, which is a question with no answer. What
 * replaces it is a level per language, and — far more often — an instruction to
 * read the level off the handwriting, since most of the roster has no grade
 * recorded at all.
 *
 * Still one model call. The two summaries are written in one pass and a second
 * call to translate would double the latency to buy a constraint that the
 * prompt can state.
 */
const worksheetPrompt = (ctx: CaptureContext) => `${WORKSHEET_PROMPT}\n\n${readingLevelBrief(ctx)}`

const SKILL_GRAPH_URL = process.env['SKILL_GRAPH_URL'] ?? 'http://127.0.0.1:3001'

/** What the grader returns, as far as recording an attempt is concerned. */
interface WorksheetEvaluation {
  is_worksheet?: boolean | null
  not_worksheet_reason?: string | null
  questions?: GradedQuestion[]
  overall_quality?: string
  summary_en?: string
  summary_zh?: string
  next_focus?: string
}

/**
 * The last edge of the flywheel (BHCS-31).
 *
 * A graded page becomes movement on the Blueprint. Everything on both sides of
 * this has worked for a while: the pipeline reads a worksheet and streams a
 * Debrief, and the skill graph can update mastery and plan what comes next.
 * Nothing connected them, so a student could turn in fifty Cards and their
 * Floor plan would not move by a point.
 *
 * Three reasons to decline, all of them silent by design — the child has their
 * Debrief and the page is stored either way:
 *
 * - **No Card code.** The page was not one of ours, or the QR did not read.
 *   Without a task there is no way to know which Rooms it was about, and
 *   guessing from the questions would attach work to skills nobody chose.
 * - **Not a worksheet.** BHCS-22's guard. A drawing graded as five imaginary
 *   questions must never become an attempt: it would move mastery on Rooms the
 *   child never worked, and nothing downstream could tell that it had.
 * - **The task names no Rooms.** A Card from before Cards targeted Rooms.
 */
async function recordAttempt({ captureId, data, context }: RecordArgs): Promise<void> {
  if (!context.taskId) return

  const evaluation = data as WorksheetEvaluation

  // BHCS-22. The guard runs before anything else is read: a page that is not a
  // worksheet has no attempt to record, however confidently it was graded.
  if (!guard(evaluation).gradeable) return

  /*
   * The Leaf, before anything else that could fail (BHCS-39).
   *
   * The child has submitted: the page is a worksheet and it has a Card behind
   * it, which is the whole test. Whether the skill graph can then be updated,
   * and how well they did, are separate questions and neither should be able
   * to cost them the credit they earned by turning work in.
   *
   * After the guard, never before it — a page that failed it has not submitted
   * anything.
   */
  await fetch(`${SKILL_GRAPH_URL}/students/${encodeURIComponent(context.student.id)}/leaves/earn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId: context.taskId }),
  }).catch(() => undefined)

  const observations = toObservations(evaluation.questions ?? [])
  if (!isRecordable(observations)) return

  const taskRes = await fetch(`${SKILL_GRAPH_URL}/tasks/${encodeURIComponent(context.taskId)}`, {
    headers: { accept: 'application/json' },
  })
  if (!taskRes.ok) throw new Error(`could not read task ${context.taskId}: ${taskRes.status}`)
  const task = (await taskRes.json()) as { kcs?: { id: string }[] }
  const kcIds = (task.kcs ?? []).map((k) => k.id)
  if (!kcIds.length) return

  const res = await fetch(
    `${SKILL_GRAPH_URL}/students/${encodeURIComponent(context.student.id)}/attempt`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kcIds,
        // `captureId` is the idempotency key: a child re-scanning the same page
        // because they could not tell whether it worked writes nothing new.
        captureId,
        taskId: context.taskId,
        // The sequence, not a verdict. See `attempts.ts` for why.
        questions: observations,
        aiEvalJson: evaluation as Record<string, unknown>,
        ...(evaluation.overall_quality && evaluation.summary_en && evaluation.summary_zh
          ? {
              debrief: {
                overallQuality: evaluation.overall_quality,
                questions: evaluation.questions ?? [],
                summaryEn: evaluation.summary_en,
                summaryZh: evaluation.summary_zh,
              },
            }
          : {}),
      }),
    },
  )
  if (!res.ok) {
    throw new Error(`attempt rejected for ${context.student.id}: ${res.status} ${await res.text()}`)
  }
}

export const worksheetServer: CaptureAppServer = {
  id: 'worksheet',
  extract: {
    schema: WORKSHEET_SCHEMA,
    systemPrompt: worksheetPrompt,
    userPrompt: 'Evaluate this completed worksheet.',
    /*
     * BHCS-10. A graded worksheet is the one capture kind whose result is a
     * document a child sits and reads, so it is the one where the arrival
     * order is worth anything: `propertyOrdering` puts `questions` first, so
     * question 1 is on screen while the summary is still being written.
     *
     * The judgement stays whole. What streams is the order the model already
     * writes in, not a second, hastier pass.
     */
    stream: true,
  },
  record: recordAttempt,
}

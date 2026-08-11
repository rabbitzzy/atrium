/**
 * Worksheet — server half.
 *
 * Mirrors the EvaluationResult shape the Python evaluator already returns, so
 * the kiosk's existing Debrief renderer works against either path unchanged.
 */

import type { CaptureAppServer, CaptureContext, GeminiSchema } from '@atrium/schema'
import { readingLevelBrief } from './reading-level'

const WORKSHEET_SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
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
  required: ['questions', 'overall_quality', 'summary_en', 'summary_zh', 'next_focus'],
  propertyOrdering: ['questions', 'overall_quality', 'summary_en', 'summary_zh', 'next_focus'],
}

/**
 * What the job is, for every student. Everything that varies by who handed the
 * page over lives in `reading-level.ts` and is appended below.
 */
const WORKSHEET_PROMPT = `You evaluate completed worksheets from a bilingual Chinese-English learning hub.

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
}

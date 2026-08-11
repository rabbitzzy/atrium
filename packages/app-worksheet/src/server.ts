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
student did, not what they failed to do.`

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

/**
 * Worksheet — server half.
 *
 * Mirrors the EvaluationResult shape the Python evaluator already returns, so
 * the kiosk's existing Debrief renderer works against either path unchanged.
 */

import type { CaptureAppServer, GeminiSchema } from '@atrium/schema'

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

const WORKSHEET_PROMPT = `You evaluate completed worksheets from a bilingual Chinese-English learning hub for TK-5 students.

Transcribe each answer exactly as written, then judge it. When handwriting is
genuinely unclear, transcribe your best reading and say so in the misconception
field rather than guessing silently — a flagged uncertainty is useful to a
teacher, a confident wrong transcription is not.

Feedback is read by a child. Write it warmly and specifically. Name what the
student did, not what they failed to do. summary_zh is a real translation of
summary_en, not a transliteration.`

export const worksheetServer: CaptureAppServer = {
  id: 'worksheet',
  extract: {
    schema: WORKSHEET_SCHEMA,
    systemPrompt: WORKSHEET_PROMPT,
    userPrompt: 'Evaluate this completed worksheet.',
  },
}

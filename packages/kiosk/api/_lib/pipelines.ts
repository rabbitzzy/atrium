/**
 * Capture pipelines — one per kind.
 *
 * Each returns the same outcome shape so api/capture.ts can persist results
 * without branching on kind.
 */

import type { GeminiSchema } from '@atrium/schema'
import { visionJson } from './gemini'

export const CAPTURE_KINDS = ['worksheet', 'chess', 'doodle'] as const
export type CaptureKind = (typeof CAPTURE_KINDS)[number]

export interface PipelineOutcome {
  status: 'ok' | 'skipped' | 'failed'
  data: unknown | null
  model: string | null
  ms: number | null
  error: string | null
}

// ── Worksheet ────────────────────────────────────────────────────────────────
// Mirrors the EvaluationResult shape the Python evaluator already returns, so
// the kiosk's existing Debrief renderer works against either path unchanged.

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

// ── Chess ────────────────────────────────────────────────────────────────────
// Output matches chess-karma's ocr.extract_moves() exactly, so a stored capture
// can be piped straight into that repo's parser/validator:
//     python run_local.py capture.ocr.json
// That keeps the 3-pass python-chess corrector — the genuinely hard part — in
// the place it already works, rather than reimplementing it here.

const CHESS_SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    metadata: {
      type: 'OBJECT',
      properties: {
        white: { type: 'STRING', nullable: true },
        black: { type: 'STRING', nullable: true },
        date: { type: 'STRING', nullable: true },
        round: { type: 'STRING', nullable: true },
        board: { type: 'STRING', nullable: true },
        result: { type: 'STRING', nullable: true },
      },
      required: ['white', 'black', 'date', 'round', 'board', 'result'],
      propertyOrdering: ['white', 'black', 'date', 'round', 'board', 'result'],
    },
    moves: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          n: { type: 'INTEGER', description: 'Move number printed on the sheet' },
          w: { type: 'STRING', nullable: true, description: "White's move, verbatim" },
          b: { type: 'STRING', nullable: true, description: "Black's move, verbatim" },
        },
        required: ['n', 'w', 'b'],
        propertyOrdering: ['n', 'w', 'b'],
      },
    },
  },
  required: ['metadata', 'moves'],
  propertyOrdering: ['metadata', 'moves'],
}

// Ported from chess-karma/prompts/scoresheet.txt. The verbatim-preservation
// rules read as heavy-handed, but they are load-bearing and stay as written:
// models autocorrect chess notation by reflex, and this pipeline's entire value
// is capturing what the child actually wrote so the downstream corrector can
// reason about the error. Softening these produces silently "clean" output.
const CHESS_PROMPT = `You are extracting chess moves from a handwritten scoresheet image.

The scoresheet has two panels:
- LEFT panel: move numbers 1 through 20 (approximately), each row has a move number, a WHITE move, and a BLACK move
- RIGHT panel: move numbers 21 onward, same layout

CRITICAL RULES:
1. Extract VERBATIM what is handwritten — do NOT correct spelling, do NOT normalize notation
2. Use the row number printed on the sheet as the authoritative move number (n)
3. If a cell is blank or clearly missing, use null
4. For castling written as 0-0 or 0-0-0, preserve it exactly as written
5. Preserve any check (+) or checkmate (#) symbols if written
6. Include capture (x) exactly as written — do NOT add or remove it
7. Preserve the exact case the child wrote (e.g., "bc4" not "Bc4", "NVH6" not "Nh6")
8. Preserve stray or unclear characters — do not clean them up

Extract the metadata and all moves in order from move 1 to the last written move.`

// ── Dispatch ─────────────────────────────────────────────────────────────────

export async function runPipeline(
  kind: CaptureKind,
  image: Buffer,
  mimeType: string,
): Promise<PipelineOutcome> {
  // Doodles are stored, never interpreted. Machine-reading a child's drawing
  // buys nothing here and invites judgments nobody asked for.
  if (kind === 'doodle') {
    return { status: 'skipped', data: null, model: null, ms: null, error: null }
  }

  try {
    const { data, model, ms } =
      kind === 'worksheet'
        ? await visionJson({
            image,
            mimeType,
            systemPrompt: WORKSHEET_PROMPT,
            userPrompt: 'Evaluate this completed worksheet.',
            schema: WORKSHEET_SCHEMA,
          })
        : await visionJson({
            image,
            mimeType,
            systemPrompt: CHESS_PROMPT,
            userPrompt: 'Extract all chess moves and metadata from this scoresheet.',
            schema: CHESS_SCHEMA,
          })

    return { status: 'ok', data, model, ms, error: null }
  } catch (err) {
    // A failed pipeline must never lose the image — capture.ts has already
    // persisted it to Drive by this point, and the row is written either way.
    return { status: 'failed', data: null, model: null, ms: null, error: (err as Error).message }
  }
}

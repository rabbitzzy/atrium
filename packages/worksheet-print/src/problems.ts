/**
 * Asking for problems, and checking what comes back (BHCS-35).
 *
 * The generator used to hand Gemini a list of Room ids — `math/base-ten/add-3-digit`
 * — and hope. A path is a primary key, not a description: the model had to
 * infer the skill from a slug, guess the grade from nothing, and translate a
 * hyphenated English fragment into Chinese. That is three inferences the
 * Blueprint already has answers for, since 004 seeds every Room with a
 * bilingual label and a grade band.
 *
 * So the prompt is built from the Rooms themselves, and the response is
 * schema-constrained rather than parsed hopefully.
 *
 * ── Never print a blank Card ──
 *
 * The old parse was `try { JSON.parse(raw) } catch { return [] }`, and an empty
 * array rendered a Card with a header, a QR code and no problems. Under the
 * Leaf economy that is the worst possible failure: the student spends a credit,
 * the printer spends a sheet, and the child gets a page with nothing on it —
 * then has nothing to submit, so they cannot earn the Leaf back. A generation
 * failure has to be loud, and it has to happen before anything is deducted.
 *
 * Pure: builds a string, validates a value. The network call and the PDF live
 * elsewhere, which is what lets the wording and the guard rails be tested.
 */

import type { GeminiSchema } from '@atrium/schema'

/** A Room, as the Blueprint describes it. */
export interface TargetRoom {
  id: string
  labelEn: string
  labelZh: string
  /** Grade band 1–5, seeded by 004. */
  difficulty: number
}

export interface GeneratedProblem {
  number: number
  promptEn: string
  promptZh: string
  /** How many ruled lines to leave. The evaluator maps answers by line index. */
  answerLines: number
}

/**
 * Strict shape, so a malformed response is Gemini's problem rather than ours.
 * `propertyOrdering` puts the English prompt first because it is what the
 * Chinese is translated from, and a model writes better when it writes in that
 * order.
 */
export const PROBLEM_SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    problems: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          number: { type: 'INTEGER' },
          promptEn: { type: 'STRING' },
          promptZh: { type: 'STRING' },
          answerLines: { type: 'INTEGER', description: 'Ruled lines to leave, 1 to 4' },
        },
        required: ['number', 'promptEn', 'promptZh', 'answerLines'],
        propertyOrdering: ['number', 'promptEn', 'promptZh', 'answerLines'],
      },
    },
  },
  required: ['problems'],
  propertyOrdering: ['problems'],
}

/** Never fewer than this, or the Card is not worth the sheet it costs. */
export const MIN_PROBLEMS = 3
/** Never more, or it will not fit the fixed layout the scanner depends on. */
export const MAX_PROBLEMS = 5

export function buildProblemPrompt(rooms: TargetRoom[], count = MAX_PROBLEMS): string {
  const roomLines = rooms
    .map((r) => `- ${r.labelEn} / ${r.labelZh} (grade ${r.difficulty}, id ${r.id})`)
    .join('\n')

  // Where a Card spans two Rooms it is a cross-over — a word problem carrying a
  // reading Room alongside an arithmetic one — and the whole point is that both
  // are exercised in one question, so the model is told to combine rather than
  // to alternate.
  const combining =
    rooms.length > 1
      ? `\nThese Rooms are deliberately paired: write problems that need both at once, not some of each. A word problem that requires reading comprehension to set up and arithmetic to finish is the shape being asked for.`
      : ''

  return `You write worksheet problems for a bilingual Chinese-English learning hub. A child works these on paper, with a pencil, at a shared station.

Write ${count} problems targeting these skills:

${roomLines}${combining}

Rules that are not negotiable:

- Solvable with a pencil. No calculator, no internet, no looking anything up.
- Printable text only. No images, no diagrams, no tables, no URLs, no emoji.
- Both languages, every problem. The Chinese is a real translation for a child who reads Chinese, not a gloss of the English — write what a Chinese textbook would ask, not a word-for-word rendering.
- Grade-appropriate for the band above. Grade 1 means one step and words a six-year-old says out loud. Grade 5 means several steps and an inference.
- Unambiguous. Exactly one correct answer, and a child who knows the skill can tell what is being asked without a teacher.
- Vary the shape. Five near-identical problems teach nothing that one problem does not.

answerLines is how much room to leave: 1 for a number or a single word, 2 to 3 for working out, 4 for a written sentence or two.`
}

export class ProblemGenerationError extends Error {}

/**
 * Turn whatever came back into problems, or refuse.
 *
 * Throws rather than returning a short list, because every caller is one step
 * from spending a Leaf and a sheet of paper. Renumbers sequentially: the model
 * is asked for `number` and mostly obliges, but a Card whose questions run 1, 2,
 * 2, 4 cannot be matched to answer regions on the way back in.
 */
export function validateProblems(raw: unknown): GeneratedProblem[] {
  const list = (raw as { problems?: unknown })?.problems
  if (!Array.isArray(list)) {
    throw new ProblemGenerationError('model returned no problems array')
  }

  const problems = list.flatMap((item, i): GeneratedProblem[] => {
    const p = item as Partial<GeneratedProblem>
    const promptEn = typeof p.promptEn === 'string' ? p.promptEn.trim() : ''
    const promptZh = typeof p.promptZh === 'string' ? p.promptZh.trim() : ''
    // A problem missing either language is dropped, not printed half-blank:
    // this is a bilingual school and a monolingual Card silently excludes
    // whichever child needed the other side.
    if (!promptEn || !promptZh) return []
    const lines = Number(p.answerLines)
    return [
      {
        number: i + 1,
        promptEn,
        promptZh,
        answerLines: Number.isFinite(lines) ? Math.min(4, Math.max(1, Math.round(lines))) : 2,
      },
    ]
  })

  if (problems.length < MIN_PROBLEMS) {
    throw new ProblemGenerationError(
      `only ${problems.length} usable problem${problems.length === 1 ? '' : 's'}; a Card costs a Leaf and a sheet, so it is not printed`,
    )
  }
  return problems.slice(0, MAX_PROBLEMS)
}

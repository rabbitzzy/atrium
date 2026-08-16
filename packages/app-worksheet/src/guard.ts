/**
 * Deciding whether the page was a worksheet at all (BHCS-22).
 *
 * Handed a photo of a child's drawing, this pipeline graded five imaginary
 * questions as `mastered` and wrote a warm summary about creativity.
 * Reproduced against `gemini-2.5-flash` on 2026-08-05.
 *
 * ── Why it is worse than an error ──
 *
 * An error state is recoverable: it says something went wrong and the child
 * tries again. A plausible fabrication is not. Nothing signals it — not to the
 * student, not to the teacher reading the Debrief later, and since BHCS-31 not
 * to the BKT update either, which will now happily move mastery on Rooms the
 * child never worked because a model invented five questions about a dragon.
 *
 * It also aims at exactly the youngest students: the most likely to put the
 * wrong page down, and the least likely to notice that the feedback does not
 * match what they did.
 *
 * ── Why the model is asked, rather than the answer being inferred ──
 *
 * The temptation is to guess after the fact — no transcripts, suspiciously
 * round scores, every question `mastered`. All of those are properties a real
 * worksheet can have. A part-done page is mostly blank; a child who found the
 * Card easy really does get five out of five; a first-grader's answers really
 * are one character long.
 *
 * So the question is asked first, in the schema, before anything is graded, and
 * `is_worksheet` leads `propertyOrdering` so the streaming path (BHCS-10)
 * learns the answer before a single question arrives. A model that has already
 * written four gradings has committed to the page being gradeable; one asked up
 * front has not.
 *
 * Pure. Given an evaluation, says whether it may be shown and recorded.
 */

export interface GuardableEvaluation {
  /**
   * The model's own answer. Absent means an older row from before this schema
   * existed — treated as a worksheet, because those were all real ones and
   * refusing them retroactively would blank a child's history.
   */
  is_worksheet?: boolean | null
  not_worksheet_reason?: string | null
  questions?: unknown[]
}

export type GuardVerdict =
  | { gradeable: true }
  | { gradeable: false; reason: 'declared' | 'no-questions'; detail: string | null }

/**
 * Two ways a page fails, and they are not the same failure.
 *
 * `declared` is the model saying outright that this is not a worksheet, which
 * is the case this ticket exists for. `no-questions` is a page it accepted and
 * then found nothing on — a blank Card, or a photo of the desk with a corner of
 * paper in it. Both end at the same screen, and keeping them apart matters for
 * anyone later asking how often each happens.
 */
export function guard(evaluation: GuardableEvaluation): GuardVerdict {
  if (evaluation.is_worksheet === false) {
    return {
      gradeable: false,
      reason: 'declared',
      detail: evaluation.not_worksheet_reason ?? null,
    }
  }

  if (Array.isArray(evaluation.questions) && evaluation.questions.length === 0) {
    return { gradeable: false, reason: 'no-questions', detail: null }
  }

  return { gradeable: true }
}

/**
 * What the station says instead of a Debrief.
 *
 * The Docent's register, and the constraint is that it must not blame. A child
 * who put the wrong page down did not do anything wrong, and very often they
 * did exactly what they meant to — they wanted to show someone their drawing,
 * and picked the button nearest their hand.
 *
 * So the sentence names what the station saw, asks rather than instructs, and
 * points at the thing they probably wanted. It never says "invalid", never says
 * "error", and never implies the page was bad.
 */
export const NOT_A_WORKSHEET = {
  titleEn: "That doesn't look like a worksheet",
  titleZh: '这好像不是练习卡',
  bodyEn:
    'No problem at all — I just can’t grade this one. If you wanted to show me a drawing, press the pink button instead. If this really is your Card, lay it flat so all four corners show and try again.',
  bodyZh:
    '完全没关系，只是这一张我没法批改。如果你想给我看一幅画，请按粉色的按钮。如果这真的是你的练习卡，把它放平、四个角都露出来，再试一次。',
} as const

/**
 * The same thing out loud (BHCS-15).
 *
 * Shorter than the screen text on purpose. A child who has just been told the
 * machine cannot read their page is not going to sit through four sentences,
 * and the buttons are right there.
 */
export const NOT_A_WORKSHEET_SPOKEN = {
  en: ["That doesn't look like a worksheet, so I can't grade this one.", 'Want to try again?'],
  zh: ['这好像不是练习卡，所以我没法批改。', '要不要再试一次？'],
} as const

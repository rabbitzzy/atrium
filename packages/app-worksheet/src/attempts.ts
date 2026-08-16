/**
 * Turning a graded page into movement on the Blueprint (BHCS-31).
 *
 * The mapping the ticket leaves open: "The evaluation is per-question quality
 * tiers, not a boolean. Deciding the mapping is part of this ticket."
 *
 * ── Four tiers into two questions, not one ──
 *
 * BKT consumes a boolean, and the obvious move is to split the four tiers down
 * the middle — `mastered` and `shaky` are right, the other two are wrong. That
 * throws away the distinction the tiers exist to make. `shaky` is not a correct
 * answer, it is an answer that arrived by a route the child could not repeat,
 * and `needs-help` is not a wrong answer, it is a wrong answer with the shape
 * of the right one visible in it. Treating either as a full-strength
 * observation claims more than the grader said.
 *
 * So a tier answers two questions rather than one: which direction, and how
 * hard. Direction is the boolean BKT wants. Strength is the `confidence` weight
 * BHCS-29 already threads through `bktUpdateWeighted`, where a half-weight
 * observation moves the mean half as far and adds half as much evidence — which
 * is exactly what "they sort of got it" should do to a number.
 *
 * That reuse is deliberate and worth being explicit about, because the weight
 * now carries two things: how sure the grader was that it read the page right,
 * and how decisive the answer was. They compose by multiplication, and they
 * compose honestly — both are answers to "how much does this observation tell
 * us about whether this child knows this skill".
 *
 * ── Every question, in order ──
 *
 * A Card's questions become a sequence of attempts rather than one verdict.
 * Four right then one wrong is a child who slipped at the end; one wrong then
 * four right is a child who worked out what was being asked. Both average to
 * 4/5, and only one of them should leave a Room looking shaky.
 *
 * ── Every question counts against every Room ──
 *
 * The evaluation does not say which Room a given question belonged to, and it
 * should not have to: the Card was generated for a target set, so every
 * question on it is about that set. For the usual single-Room Card this is
 * exact. For a crossover Card it is an approximation — a word problem carries a
 * reading Room and an arithmetic one, and a child who set it up right and added
 * wrong has told us something different about each. Which of the two it was is
 * the most useful thing a Debrief could report, and the grader does not
 * currently produce it. Left as an approximation on purpose rather than guessed
 * at from the misconception text.
 *
 * Pure. The HTTP call lives in `server.ts`; this decides what to send.
 */

import type { QualityTier } from '@atrium/schema'

/** One question, as the worksheet grader tiers it. */
export interface GradedQuestion {
  number: number
  quality: QualityTier
}

/** One observation, in the shape `POST /students/:id/attempt` accepts. */
export interface AttemptObservation {
  number: number
  correct: boolean
  /** 0–1. How much this observation is worth as evidence. */
  confidence: number
}

/**
 * Direction and strength per tier.
 *
 * `shaky` and `needs-help` sit at half weight because they are the tiers that
 * mean "partly". `mastered` and `not-yet` are the grader saying it plainly, and
 * are worth a full observation each.
 */
const TIER: Record<QualityTier, { correct: boolean; weight: number }> = {
  mastered: { correct: true, weight: 1 },
  shaky: { correct: true, weight: 0.5 },
  'needs-help': { correct: false, weight: 0.5 },
  'not-yet': { correct: false, weight: 1 },
}

/** Below this the grade is not evidence about the child at all. */
const MIN_WEIGHT = 0.05

/**
 * Build the observation sequence for one graded Card.
 *
 * `gradeConfidence` is how sure the grader was that it read the page correctly,
 * and multiplies through every question — a photograph the model struggled with
 * should not move a child's Floor plan as hard as a clean one. Nothing emits it
 * yet, so it defaults to 1 and this composes to the tier weights alone.
 *
 * Questions arrive in the order they were asked and stay in it. Anything the
 * grader did not tier is dropped rather than guessed at.
 */
export function toObservations(
  questions: GradedQuestion[],
  gradeConfidence = 1,
): AttemptObservation[] {
  const scale = Math.min(1, Math.max(0, gradeConfidence))

  return questions
    .filter((q) => TIER[q.quality] !== undefined && Number.isFinite(q.number) && q.number > 0)
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((q) => {
      const tier = TIER[q.quality]
      return {
        number: q.number,
        correct: tier.correct,
        confidence: Math.max(MIN_WEIGHT, tier.weight * scale),
      }
    })
}

/**
 * Whether this evaluation is worth recording at all.
 *
 * A page with nothing gradeable on it — the model could not read it, or it was
 * never a worksheet — must not become an attempt. The known failure in the
 * roadmap is the pipeline confidently grading a child's drawing as five
 * imaginary questions; if that ever reaches here, recording it would move
 * mastery on Rooms the child never worked.
 */
export function isRecordable(observations: AttemptObservation[]): boolean {
  return observations.length > 0
}

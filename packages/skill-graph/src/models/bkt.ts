/**
 * Minimal Bayesian Knowledge Tracing (BKT) implementation.
 * Reference: Corbett & Anderson (1994).
 *
 * Four per-KC parameters:
 *   p_L0   — prior probability of mastery before any attempt
 *   p_T    — probability of learning (transitioning to mastery) on each attempt
 *   p_S    — slip: probability of wrong answer despite mastery
 *   p_G    — guess: probability of correct answer without mastery
 */

export interface BktParams {
  pL0: number  // prior
  pT:  number  // learn rate
  pS:  number  // slip
  pG:  number  // guess
}

// Sensible defaults calibrated to general K-5 tasks; tune per-KC with real data.
export const DEFAULT_BKT_PARAMS: BktParams = {
  pL0: 0.3,
  pT:  0.1,
  pS:  0.1,
  pG:  0.2,
}

/**
 * Update mastery probability given a single observation.
 * Returns the new P(mastery).
 */
export function bktUpdate(pL: number, correct: boolean, params: BktParams): number {
  const { pT, pS, pG } = params

  // P(observation | mastery) and P(observation | not mastery)
  const pObs_given_L    = correct ? (1 - pS) : pS
  const pObs_given_notL = correct ? pG       : (1 - pG)

  // Bayes' theorem: posterior P(mastery | observation)
  const pObs = pL * pObs_given_L + (1 - pL) * pObs_given_notL
  const pL_given_obs = (pL * pObs_given_L) / pObs

  // Apply learning transition: P(mastery after attempt) = P(was already mastered | obs) + P(just learned)
  return pL_given_obs + (1 - pL_given_obs) * pT
}

/**
 * Run BKT over a sequence of observations (true = correct).
 * Returns the final mastery probability.
 */
export function bktSequence(observations: boolean[], params: BktParams = DEFAULT_BKT_PARAMS): number {
  return observations.reduce((pL, correct) => bktUpdate(pL, correct, params), params.pL0)
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

/**
 * BKT with soft evidence (BHCS-29).
 *
 * Textbook BKT treats every observation as a fact: the child either got it
 * right or they did not. Ours does not know that. It knows what a multimodal
 * model read off a photograph of handwriting, and the product docs are explicit
 * that such a grade is formative rather than summative — provisional until a
 * teacher says otherwise.
 *
 * `weight` is how much to believe this particular reading. The posterior is
 * computed exactly as before and the result is then interpolated from where the
 * student already stood, so weight 1 is ordinary BKT and weight 0 is a page the
 * system could not read at all: no movement, in either direction.
 *
 * Interpolating rather than, say, softening the slip parameter keeps the two
 * things separate that must stay separate. `pS` is a claim about *children* —
 * how often someone who knows a skill still gets it wrong. `weight` is a claim
 * about *this photograph*. Folding an unreadable scan into the slip rate would
 * teach the model that children are careless, which is the wrong lesson and a
 * permanent one.
 *
 * Note that weight 0 also suppresses the learn transition. That is intended: if
 * we cannot tell what happened on this page, we cannot claim the child learned
 * from it either.
 */
export function bktUpdateWeighted(
  pL: number,
  correct: boolean,
  params: BktParams,
  weight = 1,
): number {
  const w = clamp01(weight)
  if (w === 0) return pL
  const full = bktUpdate(pL, correct, params)
  return pL + w * (full - pL)
}

export interface ConfidenceBand {
  lo: number
  hi: number
}

/**
 * How much to trust the number (BHCS-29, and the reason BHCS-33 asks for it).
 *
 * This is **not** a posterior credible interval. BKT does not produce one — it
 * emits a point estimate and no dispersion, and inventing a Bayesian-sounding
 * interval on top would dress a heuristic up as statistics.
 *
 * What it is: a legibility device with one honest property, that it narrows as
 * evidence accumulates at the 1/sqrt(n) rate real estimates do. A Room at 0.9
 * after two attempts and one at 0.9 after twenty are not the same claim, and
 * during the cold-start weeks almost every Room is the first kind. Half-width
 * runs 0.50 at no evidence, 0.22 at four attempts, 0.11 at twenty.
 *
 * Kept here, next to the estimate it qualifies, so no display surface invents
 * its own rule.
 */
export function confidenceBand(masteryProb: number, evidence: number): ConfidenceBand {
  const halfWidth = 0.5 / Math.sqrt(Math.max(0, evidence) + 1)
  return {
    lo: clamp01(masteryProb - halfWidth),
    hi: clamp01(masteryProb + halfWidth),
  }
}

/**
 * The most a single Visit may push one Room down.
 *
 * Chosen against the seeded parameters rather than picked round. Working from
 * a 0.35 prior, consecutive wrong answers reach 0.174 then 0.131 and asymptote
 * near 0.128 — a total fall of about 0.22, so this bound never binds on a Room
 * the student was still learning, which is the case where the evidence is
 * genuinely informative and should be allowed through.
 *
 * Where it does bind is the case it exists for. A Room already at 0.95 falls to
 * 0.78 after one wrong answer, 0.44 after two and 0.20 after three: a child who
 * is tired, rushing, or handed the wrong worksheet can have a mastered skill
 * erased inside one Visit. That is not evidence about the child, it is evidence
 * about the afternoon. The bound lets a bad day register — 0.95 floors at 0.65,
 * which will visibly re-plan their next session — without deleting a month of
 * work.
 */
export const SESSION_DROP_LIMIT = 0.3

/**
 * Bound the fall, measured from where the Room stood when this Visit began —
 * not from where it stood before this page. A child working ten problems on one
 * Card must not be able to walk the number down 0.3 per problem.
 *
 * On the first attempt of a Visit the caller passes the pre-attempt mastery,
 * since that is exactly where the Visit began. Null means there is no Visit to
 * measure against at all — a teacher entering a result by hand — and then
 * nothing is bounded.
 */
export function applySessionFloor(next: number, sessionStart: number | null): number {
  if (sessionStart === null) return next
  return Math.max(next, sessionStart - SESSION_DROP_LIMIT)
}

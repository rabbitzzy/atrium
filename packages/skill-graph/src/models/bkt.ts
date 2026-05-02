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

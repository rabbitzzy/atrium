/**
 * Building a Floor plan out of the Blueprint and whatever history exists.
 *
 * The old `GET /students/:id/radar` selected straight from `student_kc_state`
 * and returned whatever it found, which for a student who has never used the
 * station is `[]`. An empty array is not a radar chart with nothing plotted on
 * it — it is a radar chart with no axes, and there is nothing a caller can
 * draw from it. BHCS-28 asks for a shape that is usable before any history
 * exists, and the shape that satisfies that is the whole Blueprint with each
 * KC sitting at its own BKT prior.
 *
 * That is also the honest reading of BKT. `bkt_p_l0` is the model's belief
 * about a student it has never met, so a first-time student is not "unknown",
 * they are "at the prior". The `seen` flag is what separates the two for a
 * caller that cares — a teacher looking at a low number wants to know whether
 * it is evidence or an assumption, and `attempts: 0` says assumption.
 *
 * Pure, and deliberately so: this is a join over two arrays, which makes the
 * defaulting decisions readable in a test rather than only observable against
 * a seeded database.
 */

/** A row of the Blueprint, as far as the radar is concerned. */
export interface BlueprintKc {
  id: string
  label_en: string
  label_zh: string
  subject: string
  depth: number
  difficulty: number
  bkt_p_l0: number
}

/** A row of `student_kc_state`. Absent for any KC the student has not met. */
export interface KcStateRow {
  kc_id: string
  mastery_prob: number
  attempts: number
  last_seen_at: string | null
}

export interface RadarPoint {
  kcId: string
  labelEn: string
  labelZh: string
  subject: string
  depth: number
  difficulty: number
  /** Posterior where there is history, `bkt_p_l0` where there is not. */
  masteryProb: number
  attempts: number
  lastSeenAt: string | null
  /**
   * Whether `masteryProb` is evidence or assumption. False means the number is
   * a prior nobody has tested — either the Blueprint's own, or one a teacher
   * placed the student at.
   *
   * This asks `attempts > 0` rather than "is there a row", and the distinction
   * became load-bearing with BHCS-32. A placement writes a `student_kc_state`
   * row for every Room in the Blueprint, so row-existence would report `true`
   * everywhere the moment a teacher filled in the form — the radar would claim
   * measurement for thirty Rooms the child had never been asked about, which is
   * the exact lie this flag exists to prevent.
   */
  seen: boolean
}

/**
 * Left-join the Blueprint against a student's history.
 *
 * Blueprint order is preserved, so a caller that sorted the KCs on the way in
 * gets them back in that order. State rows with no matching KC are dropped
 * rather than appended: they are KCs retired by a later migration, and a radar
 * axis for a skill that no longer exists is noise on a teacher's screen.
 */
export function buildRadar(blueprint: BlueprintKc[], state: KcStateRow[]): RadarPoint[] {
  const byKc = new Map(state.map((row) => [row.kc_id, row]))

  return blueprint.map((kc) => {
    const seen = byKc.get(kc.id)
    return {
      kcId: kc.id,
      labelEn: kc.label_en,
      labelZh: kc.label_zh,
      subject: kc.subject,
      depth: kc.depth,
      difficulty: kc.difficulty,
      masteryProb: seen?.mastery_prob ?? kc.bkt_p_l0,
      attempts: seen?.attempts ?? 0,
      lastSeenAt: seen?.last_seen_at ?? null,
      seen: (seen?.attempts ?? 0) > 0,
    }
  })
}

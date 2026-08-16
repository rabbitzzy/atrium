/**
 * Turning what a teacher knows into a Floor plan (BHCS-32).
 *
 * BKT needs roughly five to ten attempts per skill before it says anything
 * trustworthy, so for the first six weeks of a pilot nearly every planning
 * decision runs on priors. The difference between a planner that is guessing
 * and one that is merely uncertain is whether those priors came from anywhere.
 *
 * They come from a teacher. Ms. Chen already knows roughly where a child is,
 * her estimate costs five minutes, and taking it does not require making a
 * seven-year-old sit a test on their first-ever visit.
 *
 * ── The form is per subject ──
 *
 * Nobody fills in thirty Rooms. The teacher gives a grade band per subject root
 * — `math: 3`, `lang/en: 3`, `lang/zh: 1` — and each Room's prior is derived
 * from the distance between that band and the Room's own `difficulty`, which
 * 004 already seeds as a grade band for exactly this kind of use. A Room two
 * grades below where the child is placed is probably known; one two grades
 * above probably is not; the interesting ones are the Rooms sitting at their
 * level, which is where the planner should be looking anyway.
 *
 * Rooms a teacher has a specific opinion about can be named individually, using
 * the quality tiers the product already speaks rather than a number — a teacher
 * saying "shaky" is giving a better-calibrated answer than a teacher inventing
 * 0.55.
 *
 * ── Two rules that are not negotiable ──
 *
 * **A placement seeds priors, never evidence.** BHCS-30 defines mastery as a
 * probability at or above 0.9 *with* at least three observations behind it. If
 * a placement wrote evidence alongside the teacher's guess, the planner would
 * read that guess as measurement and skip the Room — the child would never be
 * asked about a skill an adult assumed they had. Seeded rows carry zero
 * evidence and zero attempts, so they move the ranking and can never clear the
 * gate. The highest prior this module will ever emit is 0.85, below the gate,
 * so the rule holds even if the evidence check is later relaxed.
 *
 * **Measurement outranks estimate.** A Room the student has actually attempted
 * is never overwritten. Placements are redone — a teacher revises their view, a
 * new teacher takes the class — and a redo mid-term must not erase a month of
 * real work.
 *
 * Pure: no I/O. The route reads the Blueprint and the existing Floor plan, this
 * decides what should be written, and that split is what makes the derivation
 * arguable in a test rather than only observable in a database.
 */

/** The tiers the product already uses for a graded answer. */
export type PlacementTier = 'mastered' | 'shaky' | 'needs-help' | 'not-yet'

export interface PlacementClaim {
  /** Subject-root id (`math`, `lang/en`, `lang/zh`) to grade band 1–5. */
  levels: Record<string, number>
  /** Optional per-Room opinions, which beat the derived value for that Room. */
  rooms?: Record<string, PlacementTier>
}

export interface PlacementRoom {
  kcId: string
  labelEn: string
  subject: string
  /** Grade band 1–5, as seeded by 004. */
  difficulty: number
  /** The Blueprint's own prior, used when the teacher says nothing useful. */
  bktPL0: number
  /** Real attempts already recorded. Non-zero means hands off. */
  attempts: number
}

export interface SeededRoom {
  kcId: string
  masteryProb: number
  /** Why this number, in a form a teacher can check. */
  basis: string
}

export interface PlacementResult {
  seeded: SeededRoom[]
  /** Rooms left alone because the student has already been measured on them. */
  skipped: string[]
  /** Root ids named in the claim that match no Room in the Blueprint. */
  unknownRoots: string[]
  /** Room ids named in `rooms` that are not assessable leaves here. */
  unknownRooms: string[]
}

/**
 * A teacher's explicit opinion about one Room.
 *
 * `mastered` tops out at 0.85 on purpose. A teacher saying a child has a skill
 * is good evidence about where to start and is not the same as the child having
 * demonstrated it at the station — the number should leave room for the
 * demonstration to still mean something.
 */
const TIER_PRIOR: Record<PlacementTier, number> = {
  mastered: 0.85,
  shaky: 0.55,
  'needs-help': 0.35,
  'not-yet': 0.15,
}

/**
 * Prior by how far a Room sits from the child's placed level, in grades.
 *
 * Deliberately a small table rather than a formula. A teacher can be shown five
 * rows and say "no, two grades down should be higher than that"; nobody can
 * usefully argue with a logistic curve.
 */
const PRIOR_BY_GAP: ReadonlyArray<{ minGap: number; prior: number; basis: string }> = [
  { minGap: 2, prior: 0.85, basis: 'well below their level' },
  { minGap: 1, prior: 0.7, basis: 'a grade below their level' },
  { minGap: 0, prior: 0.45, basis: 'right at their level' },
  { minGap: -1, prior: 0.25, basis: 'a grade above their level' },
  { minGap: -Infinity, prior: 0.15, basis: 'well above their level' },
]

function priorForGap(gap: number): { prior: number; basis: string } {
  const band = PRIOR_BY_GAP.find((b) => gap >= b.minGap)!
  return { prior: band.prior, basis: band.basis }
}

/**
 * Which subject root a Room belongs to. The id path is the hierarchy, so the
 * longest matching root wins — `lang/en/...` must match `lang/en`, not `lang`.
 */
function rootFor(kcId: string, roots: string[]): string | null {
  let best: string | null = null
  for (const root of roots) {
    if ((kcId === root || kcId.startsWith(root + '/')) && (!best || root.length > best.length)) {
      best = root
    }
  }
  return best
}

export function derivePlacement(claim: PlacementClaim, rooms: PlacementRoom[]): PlacementResult {
  const roots = Object.keys(claim.levels)
  const overrides = claim.rooms ?? {}

  const seeded: SeededRoom[] = []
  const skipped: string[] = []

  // Matched against the whole Blueprint, not just the Rooms this placement
  // ended up writing. A root whose Rooms were all skipped for having real
  // attempts is a root that exists — reporting it as unknown would send a
  // teacher hunting for a typo that is not there.
  const matchedRoots = new Set(
    rooms.map((r) => rootFor(r.kcId, roots)).filter((r): r is string => r !== null),
  )

  for (const room of rooms) {
    // Measurement outranks estimate, without exception.
    if (room.attempts > 0) {
      skipped.push(room.kcId)
      continue
    }

    const override = overrides[room.kcId]
    if (override) {
      seeded.push({
        kcId: room.kcId,
        masteryProb: TIER_PRIOR[override],
        basis: `teacher marked this Room "${override}"`,
      })
      continue
    }

    const root = rootFor(room.kcId, roots)
    if (root === null) {
      // The teacher said nothing about this subject. Leaving the Blueprint's
      // own prior in place is the honest response — inventing one would be
      // putting words in their mouth.
      continue
    }

    const level = claim.levels[root]!
    const { prior, basis } = priorForGap(level - room.difficulty)
    seeded.push({
      kcId: room.kcId,
      masteryProb: prior,
      basis: `grade ${room.difficulty} Room, ${basis} (placed at grade ${level} for ${root})`,
    })
  }

  return {
    seeded,
    skipped,
    unknownRoots: roots.filter((r) => !matchedRoots.has(r)),
    unknownRooms: Object.keys(overrides).filter((id) => !rooms.some((r) => r.kcId === id)),
  }
}

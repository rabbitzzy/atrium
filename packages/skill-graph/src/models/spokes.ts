/**
 * The Floor plan as a small number of readable axes (BHCS-33).
 *
 * Thirty Rooms is the right grain for planning and the wrong grain for a
 * picture — a radar chart with thirty labelled spokes is a dense polygon that
 * nobody, least of all a seven-year-old, reads at a glance.
 *
 * ── Why strands and not subject roots ──
 *
 * The ticket's design note says to aggregate to root subjects, and its own
 * model says something slightly different: Aimchess is cited for showing "not
 * `math: 70%` but `arithmetic: 70%`, `word problems: 45%`, `fractions: 30%` —
 * per-aspect, at the granularity where a next action is obvious".
 *
 * Those examples are strands, not roots. And roots would give three spokes,
 * which is a triangle: it cannot show that a child is strong at arithmetic and
 * stuck on fractions, which is the single most useful thing the picture could
 * say. So the axes are the Blueprint's depth-1 strands — thirteen of them —
 * each carrying its subject so the chart still reads as three coloured regions
 * rather than thirteen unrelated numbers.
 *
 * ── Why a band and not just a number ──
 *
 * "Show the confidence band, not just the mean. A KC with two attempts and one
 * with twenty should not look equally solid — and this is what stops the chart
 * from lying during the cold-start weeks when almost everything is prior."
 *
 * After BHCS-32 that warning is not hypothetical. A teacher's placement writes
 * a mastery probability for every Room in the Blueprint before the child has
 * answered a single question, so a chart drawn from the means alone would show
 * a complete, confident picture of a student nobody has tested. `seenRooms`
 * and the band are what keep that honest.
 *
 * Pure. Served from the same endpoint the teacher and parent views will read,
 * so the three surfaces cannot drift into three different numbers.
 */

import { confidenceBand, type ConfidenceBand } from './bkt.js'

/** One point of a Floor plan, as `buildRadar` produces it. */
export interface SpokeInput {
  kcId: string
  subject: string
  masteryProb: number
  attempts: number
  evidence: number
  seen: boolean
}

/** A strand of the Blueprint — the axis itself. */
export interface StrandLabel {
  id: string
  labelEn: string
  labelZh: string
  subject: string
}

export interface Spoke {
  strandId: string
  labelEn: string
  labelZh: string
  subject: string
  /** Mean mastery across the strand's Rooms, 0–1. */
  value: number
  band: ConfidenceBand
  rooms: number
  /** How many of those Rooms the student has actually attempted. */
  seenRooms: number
  /**
   * False when no Room in this strand has ever been attempted — the whole axis
   * is priors. The chart must show this differently or it is claiming a
   * measurement it does not have.
   */
  seen: boolean
}

/**
 * Which strand a Room belongs to. The id path is the hierarchy, so the longest
 * matching strand wins — `lang/zh/reading/...` must land on `lang/zh/reading`,
 * never on `lang/zh`.
 */
function strandFor(kcId: string, strandIds: string[]): string | null {
  let best: string | null = null
  for (const id of strandIds) {
    if (kcId.startsWith(id + '/') && (!best || id.length > best.length)) best = id
  }
  return best
}

/**
 * Collapse a Floor plan onto its strands.
 *
 * Strands with no Rooms are dropped rather than drawn at zero: an empty axis
 * says "this child knows nothing here" when the truth is "the Blueprint has
 * nothing here yet", and those are opposite messages to a parent.
 */
export function buildSpokes(points: SpokeInput[], strands: StrandLabel[]): Spoke[] {
  const strandIds = strands.map((s) => s.id)
  const buckets = new Map<string, SpokeInput[]>()

  for (const p of points) {
    const strand = strandFor(p.kcId, strandIds)
    if (strand === null) continue
    buckets.set(strand, [...(buckets.get(strand) ?? []), p])
  }

  return strands
    .filter((s) => (buckets.get(s.id)?.length ?? 0) > 0)
    .map((s) => {
      const rooms = buckets.get(s.id)!
      const value = mean(rooms.map((r) => r.masteryProb))
      // Mean rather than total evidence: the band should say how well known a
      // typical Room in this strand is. Summing would let five barely-touched
      // Rooms add up to the appearance of one well-established one.
      const evidence = mean(rooms.map((r) => r.evidence))
      const seenRooms = rooms.filter((r) => r.seen).length

      return {
        strandId: s.id,
        labelEn: s.labelEn,
        labelZh: s.labelZh,
        subject: s.subject,
        value,
        band: confidenceBand(value, evidence),
        rooms: rooms.length,
        seenRooms,
        seen: seenRooms > 0,
      }
    })
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length
}

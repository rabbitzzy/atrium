/**
 * Laying the Blueprint out as a building (BHCS-88).
 *
 * The radar answers "how am I doing"; it cannot answer "what is there, and
 * what comes next", because a strand axis has no inside. This is the second
 * picture of the same data: every Room in the Blueprint, in its place, with
 * the `prerequisite` edges that decide the order drawn between them.
 *
 * ── Why elevation, and why wings ──
 *
 * A force-directed graph would be the reflex, and it is the wrong picture for
 * this: it settles differently every load, so the child who looked at it
 * yesterday cannot find the Room they remember, and it encodes nothing —
 * position means whatever the simulation converged on. The Blueprint has two
 * real axes already, so the layout uses them and is deterministic.
 *
 * Across is **subject**: three wings, because the id prefix is three-rooted
 * (`math`, `lang/en`, `lang/zh`) even though `subject` is two-valued. Math sits
 * in the middle, which is not decoration — both `crossover` edges run from a
 * reading Room into `math/ops/word-problems-1-step`, and a centre wing is what
 * makes them short lines across the building rather than a wire around the
 * outside.
 *
 * Up is **difficulty**, floor 1 at the bottom. That makes "what comes next" a
 * direction a seven-year-old already understands, and it makes prerequisite
 * edges point mostly upwards, so an edge that runs sideways or down is visibly
 * unusual — which is exactly when someone should look at it.
 *
 * ── What is not drawn ──
 *
 * `contains` edges. They are the hierarchy, and the hierarchy is already the
 * layout — a line from `math` to `math/ops` would be a line from the picture to
 * itself. Drawing them was tried in the first sketch and produced 43 edges of
 * pure restatement over 32 that meant something.
 *
 * Pure, and separated from the drawing for the usual reason: "does every Room
 * land inside its own wing" and "does an edge ever leave the canvas" are
 * questions about numbers, and they are worth being able to ask without a
 * browser.
 */

/** A Room, as far as the layout is concerned. Comes from the radar endpoint. */
export interface MapRoom {
  kcId: string
  labelEn: string
  labelZh: string
  subject: string
  difficulty: number
  masteryProb: number
  attempts: number
  seen: boolean
}

export interface MapEdge {
  from: string
  to: string
  type: string
}

export interface PlacedRoom extends MapRoom {
  x: number
  y: number
  /** Which wing it landed in — `math`, `lang/en`, `lang/zh`. */
  wing: string
}

export interface Wing {
  id: string
  labelEn: string
  labelZh: string
  color: string
  /** Left and right edges of the wing's band, for the heading and the tint. */
  x0: number
  x1: number
}

export interface Floor {
  difficulty: number
  y: number
}

export interface BlueprintLayout {
  rooms: PlacedRoom[]
  wings: Wing[]
  floors: Floor[]
  width: number
  height: number
}

/**
 * Three wings, in reading order, and the reason math is in the middle is in the
 * file header. The colours are the radar's subject colours split one step
 * further: the two language wings are the same green at different weights,
 * because they are one `subject` and a child should see them as siblings.
 */
const WINGS: { id: string; labelEn: string; labelZh: string; color: string }[] = [
  { id: 'lang/en', labelEn: 'English', labelZh: '英文', color: '#3f7a5e' },
  { id: 'math', labelEn: 'Math', labelZh: '数学', color: '#1a6bb5' },
  { id: 'lang/zh', labelEn: 'Chinese', labelZh: '中文', color: '#2f6f8f' },
]

const COL = 96
const ROW = 104
const GUTTER = 44
const PAD_X = 26
const PAD_TOP = 62
const PAD_BOTTOM = 34

/** Which wing a Room belongs to. `lang/en/...` before `lang/...`, longest first. */
export function wingOf(kcId: string): string {
  const match = WINGS.map((w) => w.id)
    .filter((id) => kcId === id || kcId.startsWith(`${id}/`))
    .sort((a, b) => b.length - a.length)[0]
  return match ?? kcId.split('/')[0] ?? 'other'
}

/** The strand — the id with its last segment removed. Used only to keep siblings adjacent. */
const strandOf = (kcId: string): string => kcId.split('/').slice(0, -1).join('/')

/**
 * Place every Room.
 *
 * A wing is as wide as its busiest floor, so a wing with five Rooms on one
 * floor does not squash them to fit a wing that never has more than two. Within
 * a floor the Rooms are ordered by strand, so the Rooms of one strand stay
 * near each other from floor to floor and a strand reads as a vertical run.
 *
 * Rooms whose id belongs to no known wing are dropped rather than piled at the
 * origin: a Blueprint that grows a fourth root should add a wing here, and a
 * silent heap in the corner is how that goes unnoticed.
 */
export function layoutBlueprint(rooms: MapRoom[]): BlueprintLayout {
  const known = rooms.filter((r) => WINGS.some((w) => w.id === wingOf(r.kcId)))

  const difficulties = known.map((r) => r.difficulty).filter((d) => Number.isFinite(d))
  const maxDifficulty = difficulties.length ? Math.max(...difficulties) : 1
  const minDifficulty = difficulties.length ? Math.min(...difficulties) : 1
  const floorCount = maxDifficulty - minDifficulty + 1

  // Group first, because a wing's width is a property of its fullest floor and
  // cannot be known until everything has been sorted into floors.
  const byWing = new Map<string, Map<number, MapRoom[]>>()
  for (const room of known) {
    const wing = wingOf(room.kcId)
    const floors = byWing.get(wing) ?? new Map<number, MapRoom[]>()
    const floor = floors.get(room.difficulty) ?? []
    floor.push(room)
    floors.set(room.difficulty, floor)
    byWing.set(wing, floors)
  }

  const placed: PlacedRoom[] = []
  const wings: Wing[] = []
  let x = PAD_X

  for (const wing of WINGS) {
    const floors = byWing.get(wing.id)
    const busiest = floors ? Math.max(...[...floors.values()].map((f) => f.length)) : 1
    const width = Math.max(1, busiest) * COL

    wings.push({ ...wing, x0: x, x1: x + width })

    for (const [difficulty, floor] of floors ?? []) {
      const ordered = floor
        .slice()
        .sort((a, b) =>
          strandOf(a.kcId) === strandOf(b.kcId)
            ? a.kcId.localeCompare(b.kcId)
            : strandOf(a.kcId).localeCompare(strandOf(b.kcId)),
        )
      ordered.forEach((room, i) => {
        placed.push({
          ...room,
          wing: wing.id,
          x: x + ((i + 0.5) * width) / ordered.length,
          y: PAD_TOP + (maxDifficulty - difficulty) * ROW,
        })
      })
    }

    x += width + GUTTER
  }

  return {
    rooms: placed.sort((a, b) => a.kcId.localeCompare(b.kcId)),
    wings,
    floors: Array.from({ length: floorCount }, (_, i) => ({
      difficulty: maxDifficulty - i,
      y: PAD_TOP + i * ROW,
    })),
    width: x - GUTTER + PAD_X,
    height: PAD_TOP + (floorCount - 1) * ROW + PAD_BOTTOM,
  }
}

/**
 * The edges worth drawing, with both ends resolved.
 *
 * `contains` never survives this — see the header. An edge with an end that is
 * not on the map is dropped too: with `?depth=2` the headings are absent, and a
 * line to a Room that is not there would be a line to the top-left corner.
 */
export function drawableEdges(
  edges: MapEdge[],
  rooms: PlacedRoom[],
): { edge: MapEdge; from: PlacedRoom; to: PlacedRoom }[] {
  const byId = new Map(rooms.map((r) => [r.kcId, r]))
  const out: { edge: MapEdge; from: PlacedRoom; to: PlacedRoom }[] = []

  for (const edge of edges) {
    if (edge.type === 'contains') continue
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (from && to) out.push({ edge, from, to })
  }
  return out
}

/**
 * How a Room is doing, in the three states a child can tell apart at a glance.
 *
 * Deliberately the same vocabulary as the radar: filled means worked, hollow
 * means nobody has been in that Room yet. The threshold is the frontier's
 * `MASTERY_GATE`, kept in step by hand rather than imported — `skill-graph` is
 * a service, not a dependency of the kiosk, and a picture drifting a percentage
 * point from the planner is not a defect worth a shared package.
 */
export type RoomLook = 'mastered' | 'working' | 'unvisited'

export function roomLook(room: Pick<MapRoom, 'seen' | 'masteryProb'>): RoomLook {
  if (!room.seen) return 'unvisited'
  return room.masteryProb >= 0.9 ? 'mastered' : 'working'
}

/**
 * The label under a Room, as at most two lines.
 *
 * Chinese labels are four to six characters where the English is four words,
 * which is the entire reason the map is labelled in Chinese and captions in
 * both. A few are longer — `一年级字表（51-150）` — and those get cut, so they
 * are cut visibly: an ellipsis says "there is more, tap it", where a silent
 * truncation says `二年级字表（1 51-300`, which is not a name of anything.
 */
export function labelLines(text: string, perLine = 6): [string, string] {
  const clean = text.trim()
  if (clean.length <= perLine) return [clean, '']

  // Balance the two lines rather than filling the first: a 7-character label
  // reading 6 + 1 looks like a mistake, 4 + 3 looks like a label.
  const split = clean.length <= perLine * 2 ? Math.ceil(clean.length / 2) : perLine
  const first = clean.slice(0, split)
  const rest = clean.slice(split)
  return [first, rest.length > perLine ? `${rest.slice(0, perLine - 1)}…` : rest]
}

/**
 * The water line in a part-learned Room: the circular segment below `p` of the
 * diameter, filled from the bottom.
 *
 * Drawn rather than clipped because a `clipPath` per Room is thirty extra defs
 * for a shape that is one arc — and the arc's large-flag is the part worth
 * having under test, since getting it backwards fills the complement and shows
 * a struggling child a nearly full Room.
 */
export function waterLine(cx: number, cy: number, r: number, p: number): string {
  const level = Math.max(0, Math.min(1, p))
  if (level <= 0) return ''
  if (level >= 1) return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`

  const y = cy + r - 2 * r * level
  const half = Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)))
  // Sweep 0 goes counter-clockwise from the left end, which is the way round
  // the bottom. Large-arc once the line is above centre, because that segment
  // is more than half the circle.
  return `M ${cx - half} ${y} A ${r} ${r} 0 ${level > 0.5 ? 1 : 0} 0 ${cx + half} ${y} Z`
}

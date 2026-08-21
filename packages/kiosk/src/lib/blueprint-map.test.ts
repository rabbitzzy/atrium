import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  layoutBlueprint,
  drawableEdges,
  roomLook,
  labelLines,
  waterLine,
  wingOf,
  type MapRoom,
  type MapEdge,
} from './blueprint-map.js'

const room = (kcId: string, difficulty: number, over: Partial<MapRoom> = {}): MapRoom => ({
  kcId,
  labelEn: kcId,
  labelZh: kcId,
  subject: kcId.startsWith('math') ? 'math' : 'language',
  difficulty,
  masteryProb: 0.3,
  attempts: 0,
  seen: false,
  ...over,
})

/** A shape with the pilot Blueprint's awkward parts: uneven floors, an empty one. */
const pilot: MapRoom[] = [
  room('lang/en/phonics/cvc-words', 1),
  room('lang/en/reading/main-idea', 2),
  room('lang/en/grammar/noun-verb-agreement', 2),
  room('lang/en/reading/inference', 4),
  room('math/base-ten/place-value-hundreds', 2),
  room('math/ops/multiplication-facts', 3),
  room('math/ops/division-as-inverse', 3),
  room('math/ops/word-problems-1-step', 3),
  room('math/fractions/compare', 4),
  room('lang/zh/pinyin/tones', 1),
  room('lang/zh/chars/radicals', 3),
  room('lang/zh/writing/sentence-compose', 4),
]

describe('which wing a Room is in', () => {
  it('reads the id prefix, not the subject column', () => {
    // English and Chinese are one `subject` and two wings — the whole reason
    // the layout keys on the id.
    assert.equal(wingOf('lang/en/reading/main-idea'), 'lang/en')
    assert.equal(wingOf('lang/zh/chars/radicals'), 'lang/zh')
    assert.equal(wingOf('math/fractions/compare'), 'math')
  })

  it('takes the longest match, so lang/en never resolves as lang', () => {
    assert.notEqual(wingOf('lang/en/writing/paragraph-topic'), 'lang')
  })
})

describe('laying out the building', () => {
  it('places every known Room exactly once', () => {
    const { rooms } = layoutBlueprint(pilot)
    assert.equal(rooms.length, pilot.length)
    assert.equal(new Set(rooms.map((r) => r.kcId)).size, pilot.length)
  })

  it('keeps each Room inside its own wing', () => {
    const { rooms, wings } = layoutBlueprint(pilot)
    for (const r of rooms) {
      const wing = wings.find((w) => w.id === r.wing)
      assert.ok(wing, `${r.kcId} landed in no wing`)
      assert.ok(r.x >= wing.x0 && r.x <= wing.x1, `${r.kcId} at ${r.x} escaped ${r.wing}`)
    }
  })

  it('puts math between the two language wings, so the crossovers are short', () => {
    const { wings } = layoutBlueprint(pilot)
    assert.deepEqual(wings.map((w) => w.id), ['lang/en', 'math', 'lang/zh'])
  })

  it('draws floor 1 at the bottom and the hardest floor at the top', () => {
    const { rooms } = layoutBlueprint(pilot)
    const easy = rooms.find((r) => r.kcId === 'lang/zh/pinyin/tones')
    const hard = rooms.find((r) => r.kcId === 'lang/zh/writing/sentence-compose')
    assert.ok(easy && hard)
    assert.ok(hard.y < easy.y, 'difficulty 4 should sit above difficulty 1')
  })

  it('gives every Room on a floor the same height', () => {
    const { rooms } = layoutBlueprint(pilot)
    const floor3 = rooms.filter((r) => r.difficulty === 3).map((r) => r.y)
    assert.equal(new Set(floor3).size, 1)
  })

  it('keeps everything on the canvas', () => {
    const { rooms, width, height } = layoutBlueprint(pilot)
    for (const r of rooms) {
      assert.ok(r.x > 0 && r.x < width, `${r.kcId} x=${r.x} outside 0..${width}`)
      assert.ok(r.y > 0 && r.y < height, `${r.kcId} y=${r.y} outside 0..${height}`)
    }
  })

  // A wing with five Rooms on one floor must not squash them into the width of
  // a wing that never holds more than two.
  it('makes a wing as wide as its busiest floor', () => {
    const { wings } = layoutBlueprint(pilot)
    const math = wings.find((w) => w.id === 'math')
    const zh = wings.find((w) => w.id === 'lang/zh')
    assert.ok(math && zh)
    assert.ok(math.x1 - math.x0 > zh.x1 - zh.x0)
  })

  it('never overlaps two wings', () => {
    const { wings } = layoutBlueprint(pilot)
    for (let i = 1; i < wings.length; i++) {
      assert.ok(wings[i]!.x0 > wings[i - 1]!.x1, 'wings must not run into each other')
    }
  })

  it('keeps a strand together across the floor', () => {
    const { rooms } = layoutBlueprint(pilot)
    const floor3 = rooms
      .filter((r) => r.wing === 'math' && r.difficulty === 3)
      .sort((a, b) => a.x - b.x)
      .map((r) => r.kcId)
    // The two math/ops Rooms are adjacent, not split by the fractions one.
    assert.deepEqual(floor3, [
      'math/ops/division-as-inverse',
      'math/ops/multiplication-facts',
      'math/ops/word-problems-1-step',
    ])
  })

  it('gives one floor per difficulty present, no gaps and no ghosts', () => {
    const { floors } = layoutBlueprint(pilot)
    assert.deepEqual(floors.map((f) => f.difficulty), [4, 3, 2, 1])
  })

  it('is deterministic — the same Blueprint lands in the same place twice', () => {
    const a = layoutBlueprint(pilot)
    const b = layoutBlueprint(pilot.slice().reverse())
    assert.deepEqual(a.rooms, b.rooms)
  })

  // A fourth root should add a wing here, not pile up silently at the origin.
  it('drops a Room from a wing that does not exist rather than heaping it', () => {
    const { rooms } = layoutBlueprint([...pilot, room('art/drawing/perspective', 2)])
    assert.equal(rooms.length, pilot.length)
  })

  it('survives an empty Blueprint without producing a zero-sized canvas', () => {
    const { rooms, width, height } = layoutBlueprint([])
    assert.deepEqual(rooms, [])
    assert.ok(width > 0 && height > 0)
  })
})

describe('which edges get drawn', () => {
  const { rooms } = layoutBlueprint(pilot)
  const edges: MapEdge[] = [
    { from: 'math/ops/multiplication-facts', to: 'math/ops/division-as-inverse', type: 'prerequisite' },
    { from: 'lang/en/reading/main-idea', to: 'math/ops/word-problems-1-step', type: 'crossover' },
    { from: 'math', to: 'math/ops', type: 'contains' },
    { from: 'math/ops', to: 'math/ops/multiplication-facts', type: 'contains' },
    { from: 'math/base-ten/add-3-digit', to: 'math/base-ten/subtract-3-digit', type: 'prerequisite' },
  ]

  it('never draws the hierarchy, because the layout already is the hierarchy', () => {
    assert.equal(drawableEdges(edges, rooms).filter((e) => e.edge.type === 'contains').length, 0)
  })

  it('draws prerequisites and crossovers', () => {
    const types = drawableEdges(edges, rooms).map((e) => e.edge.type).sort()
    assert.deepEqual(types, ['crossover', 'prerequisite'])
  })

  // With ?depth=2 the headings are absent; a line to a Room that is not on the
  // map would be a line to the top-left corner.
  it('drops an edge with an end that is not on the map', () => {
    const drawn = drawableEdges(edges, rooms)
    assert.ok(!drawn.some((e) => e.edge.from === 'math/base-ten/add-3-digit'))
  })

  it('resolves both ends to their placed positions', () => {
    const [first] = drawableEdges(edges, rooms)
    assert.ok(first)
    assert.equal(typeof first.from.x, 'number')
    assert.equal(typeof first.to.y, 'number')
  })
})

describe('how a Room looks', () => {
  it('is hollow until somebody has actually been in it', () => {
    // A placement writes a high prior for every Room; none of them are visited.
    assert.equal(roomLook({ seen: false, masteryProb: 0.95 }), 'unvisited')
  })

  it('is mastered at the gate, working below it', () => {
    assert.equal(roomLook({ seen: true, masteryProb: 0.9 }), 'mastered')
    assert.equal(roomLook({ seen: true, masteryProb: 0.89 }), 'working')
  })
})

describe('the label under a Room', () => {
  it('leaves a short one alone', () => {
    assert.deepEqual(labelLines('声调'), ['声调', ''])
    assert.deepEqual(labelLines('主旨大意'), ['主旨大意', ''])
  })

  it('balances two lines rather than filling the first', () => {
    // 6 + 1 looks like a mistake; 4 + 3 looks like a label.
    assert.deepEqual(labelLines('故事的要素七个'), ['故事的要', '素七个'])
  })

  // The silent version of this rendered `二年级字表（1 51-300`, which is not the
  // name of anything.
  it('says out loud when it had to cut', () => {
    const [, second] = labelLines('一年级字表（51-150）')
    assert.ok(second.endsWith('…'), `expected an ellipsis, got ${second}`)
  })

  it('never returns a line longer than it was asked for', () => {
    for (const label of ['一年级字表（51-150）', '长方形的面积与周长', 'CVC 单词拼读', '声母与韵母']) {
      for (const line of labelLines(label)) assert.ok(line.length <= 6, `${label} → ${line}`)
    }
  })

  it('survives an empty label', () => {
    assert.deepEqual(labelLines(''), ['', ''])
  })
})

describe('the water line in a part-learned Room', () => {
  const path = (p: number) => waterLine(100, 100, 20, p)

  it('draws nothing at zero', () => {
    assert.equal(path(0), '')
  })

  it('fills from the bottom, not the top', () => {
    // The chord of a quarter-full Room sits below centre; three-quarters, above.
    const low = Number(path(0.25).split(' ')[2])
    const high = Number(path(0.75).split(' ')[2])
    assert.ok(low > 100, `quarter-full chord should be below centre, got ${low}`)
    assert.ok(high < 100, `three-quarters-full chord should be above centre, got ${high}`)
  })

  // Backwards, this fills the complement and shows a struggling child a nearly
  // full Room.
  it('takes the long way round only once the line is above centre', () => {
    assert.match(path(0.3), /A 20 20 0 0 0/)
    assert.match(path(0.8), /A 20 20 0 1 0/)
  })

  it('clamps rather than escaping the circle', () => {
    assert.equal(path(-1), '')
    assert.ok(path(2).includes('A 20 20'))
  })
})

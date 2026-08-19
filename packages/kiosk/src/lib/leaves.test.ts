import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { earnedLine, LEAF_AMBER, LEAF_CEILING, LEAF_GREEN, leafLook, spentLine } from './leaves'

const everyState = [0, 1, 2, 3, 4, 5].map(leafLook)
const allProse = [
  ...everyState.flatMap((l) => [l.labelEn, l.hintEn, ...l.speech.en, ...l.waysOut.map((w) => w.en)]),
  earnedLine(2).en, earnedLine(5).en, spentLine(0).en, spentLine(3).en,
].join(' ').toLowerCase()

describe('the copy rules, which are not negotiable', () => {
  it("never says a child can't print, or that anything is blocked", () => {
    for (const banned of ["can't print", 'cannot print', 'blocked', 'denied', 'not allowed', 'no printing']) {
      assert.ok(!allProse.includes(banned), `should never say "${banned}"`)
    }
  })

  it('never eco-shames', () => {
    for (const banned of ['save the tree', 'waste', 'wasting', 'the planet', 'environment']) {
      assert.ok(!allProse.includes(banned), `should never say "${banned}"`)
    }
  })

  it('frames zero as earning rather than as a refusal', () => {
    const zero = leafLook(0)
    assert.match(zero.hintEn, /earn/i)
    assert.match(zero.speech.en.join(' '), /earn/i)
  })
})

describe('the colours', () => {
  it('uses eco green wherever there is something to spend', () => {
    for (const n of [1, 2, 3, 4, 5]) assert.equal(leafLook(n).color, LEAF_GREEN)
  })

  // A low-resource signal, not an alarm. Red would make a natural pause read
  // as a fault.
  it('uses muted amber at zero, never red', () => {
    assert.equal(leafLook(0).color, LEAF_AMBER)
    assert.doesNotMatch(LEAF_AMBER, /^#(f00|ff0000|e00|d00)/i)
  })
})

describe('the zero state has a way out', () => {
  it('names both doors from eco-design.md', () => {
    const zero = leafLook(0)
    assert.equal(zero.waysOut.length, 2)
    assert.match(zero.waysOut.map((w) => w.en).join(' '), /turn in/i)
    assert.match(zero.waysOut.map((w) => w.en).join(' '), /teacher/i)
  })

  it('does not clutter the other states with them', () => {
    for (const n of [1, 3, 5]) assert.equal(leafLook(n).waysOut.length, 0)
  })
})

describe('counting', () => {
  it('says Leaf once and Leaves otherwise', () => {
    assert.match(leafLook(1).labelEn, /^1 Leaf$/)
    assert.match(leafLook(2).labelEn, /^2 Leaves$/)
    assert.match(leafLook(0).labelEn, /^0 Leaves$/)
  })

  it('tells a full basket it is full, as abundance', () => {
    const full = leafLook(LEAF_CEILING)
    assert.match(full.hintEn, /keep growing/i)
    assert.match(full.speech.en.join(' '), /as many as you can hold/i)
  })

  it('clamps nonsense rather than rendering it', () => {
    assert.equal(leafLook(-3).labelEn, '0 Leaves')
    assert.equal(leafLook(99).labelEn, `${LEAF_CEILING} Leaves`)
  })

  it('is quiet at the ordinary in-between balances', () => {
    assert.equal(leafLook(2).hintEn, '')
    assert.equal(leafLook(3).hintZh, '')
  })
})

describe('speech', () => {
  it('never reads the leaf picture aloud', () => {
    for (const l of everyState) {
      for (const line of [...l.speech.en, ...l.speech.zh]) assert.ok(!line.includes('🌿'))
    }
  })

  it('says something in both languages in every state', () => {
    for (const l of everyState) {
      assert.ok(l.speech.en.length > 0 && l.speech.zh.length > 0)
      assert.ok(l.labelZh.includes('叶子'))
    }
  })
})

describe('the moments the balance changes', () => {
  it('congratulates an earn without mentioning the score', () => {
    assert.match(earnedLine(2).en, /new Leaf/i)
    for (const tier of ['mastered', 'shaky', 'not-yet', 'wrong', 'correct']) {
      assert.ok(!earnedLine(2).en.toLowerCase().includes(tier))
    }
  })

  it('tells a full child their basket is full rather than that nothing happened', () => {
    assert.match(earnedLine(LEAF_CEILING).en, /as many Leaves as you can hold/i)
  })

  it('reports what is left after a print, in both languages', () => {
    assert.match(spentLine(1).en, /1 Leaf left/)
    assert.match(spentLine(2).en, /2 Leaves left/)
    assert.match(spentLine(0).zh, /还有 0 片/)
  })
})

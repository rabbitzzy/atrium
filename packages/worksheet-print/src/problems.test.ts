import { describe, expect, it } from 'vitest'
import {
  buildProblemPrompt,
  MIN_PROBLEMS,
  ProblemGenerationError,
  validateProblems,
  type TargetRoom,
} from './problems.js'

const ADD3: TargetRoom = {
  id: 'math/base-ten/add-3-digit',
  labelEn: 'Add 3-digit numbers with regrouping',
  labelZh: '三位数进位加法',
  difficulty: 2,
}
const MAIN_IDEA: TargetRoom = {
  id: 'lang/en/reading/main-idea',
  labelEn: 'Identify the main idea',
  labelZh: '主旨大意',
  difficulty: 2,
}

const BUDGET = { count: 5, chars: 110 }

const ok = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    number: i + 1,
    promptEn: `What is ${i}00 + ${i}7?`,
    promptZh: `${i}00 + ${i}7 等于多少？`,
    answerLines: 1,
  }))

describe('buildProblemPrompt', () => {
  it('describes the Room instead of pasting its id', () => {
    const prompt = buildProblemPrompt([ADD3], BUDGET)
    expect(prompt).toContain('Add 3-digit numbers with regrouping')
    expect(prompt).toContain('三位数进位加法')
    expect(prompt).toContain('grade 2')
  })

  it('still carries the id, so a generation can be traced to a Room', () => {
    expect(buildProblemPrompt([ADD3], BUDGET)).toContain('math/base-ten/add-3-digit')
  })

  // A crossover Card exists to fail for two different reasons at once, so
  // alternating between the two skills would defeat the point of it.
  it('tells the model to combine paired Rooms, not alternate them', () => {
    const paired = buildProblemPrompt([ADD3, MAIN_IDEA], BUDGET)
    expect(paired).toContain('need both at once')
    expect(buildProblemPrompt([ADD3], BUDGET)).not.toContain('need both at once')
  })

  it('asks for a real translation rather than a gloss', () => {
    expect(buildProblemPrompt([ADD3], BUDGET)).toContain('not a word-for-word rendering')
  })
})

describe('validateProblems', () => {
  it('accepts a well-formed batch', () => {
    expect(validateProblems({ problems: ok(5) })).toHaveLength(5)
  })

  // The failure that used to render a header, a QR code and nothing else.
  it('refuses rather than returning an empty Card', () => {
    expect(() => validateProblems({ problems: [] })).toThrow(ProblemGenerationError)
    expect(() => validateProblems({})).toThrow(ProblemGenerationError)
    expect(() => validateProblems('not json at all')).toThrow(ProblemGenerationError)
  })

  it('says why it refused, in terms of what it costs', () => {
    expect(() => validateProblems({ problems: ok(1) })).toThrow(/Leaf and a sheet/)
  })

  it('will not print a Card thinner than the minimum', () => {
    expect(() => validateProblems({ problems: ok(MIN_PROBLEMS - 1) })).toThrow(ProblemGenerationError)
    expect(validateProblems({ problems: ok(MIN_PROBLEMS) })).toHaveLength(MIN_PROBLEMS)
  })

  it('trims to what the layout it was asked for can hold', () => {
    expect(validateProblems({ problems: ok(12) }, 5)).toHaveLength(5)
    expect(validateProblems({ problems: ok(12) }, 9)).toHaveLength(9)
  })

  // A bilingual school; a monolingual problem silently excludes whichever
  // child needed the other side.
  it('drops a problem that lost one of its languages', () => {
    const mixed = [...ok(4), { number: 5, promptEn: 'Only English', promptZh: '  ', answerLines: 1 }]
    const out = validateProblems({ problems: mixed })
    expect(out).toHaveLength(4)
    expect(out.some((p) => p.promptEn === 'Only English')).toBe(false)
  })

  it('renumbers sequentially so answers can be matched back', () => {
    const scrambled = [
      { number: 1, promptEn: 'a', promptZh: '甲', answerLines: 1 },
      { number: 2, promptEn: 'b', promptZh: '乙', answerLines: 1 },
      { number: 2, promptEn: 'c', promptZh: '丙', answerLines: 1 },
      { number: 7, promptEn: 'd', promptZh: '丁', answerLines: 1 },
    ]
    expect(validateProblems({ problems: scrambled }).map((p) => p.number)).toEqual([1, 2, 3, 4])
  })

  it('clamps answer lines into what the template can draw', () => {
    const odd = ok(3).map((p, i) => ({ ...p, answerLines: [0, 99, -4][i]! }))
    expect(validateProblems({ problems: odd }).map((p) => p.answerLines)).toEqual([1, 4, 1])
  })

  it('falls back to a sensible height when the model omits it', () => {
    const missing = ok(3).map((p) => ({ ...p, answerLines: undefined }))
    expect(validateProblems({ problems: missing }).every((p) => p.answerLines === 2)).toBe(true)
  })
})

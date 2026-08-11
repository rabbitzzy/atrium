/**
 * What the Debrief says when it is read out loud — checked as strings, because
 * every rule worth having here is a rule about which words reach a child who
 * cannot read the screen.
 */

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { WorksheetOcr } from './index'
import { worksheetSpeech } from './speech'

const RESULT: WorksheetOcr = {
  questions: [
    {
      number: 1,
      quality: 'mastered',
      transcript: '42',
      misconception: null,
      suggestion: null,
    },
    {
      number: 2,
      quality: 'needs-help',
      transcript: '312',
      misconception: 'You added the ones but forgot to carry the ten.',
      suggestion: 'Try it again with 10 first.',
    },
  ],
  overall_quality: 'shaky',
  summary_en: 'You got the first one. The second needs a carry.',
  summary_zh: '第一题对了。第二题要进位。',
  next_focus: 'math/addition/regrouping',
}

describe('the Debrief out loud', () => {
  test('leads with the verdict and the summary, then each question in order', () => {
    const { en } = worksheetSpeech(RESULT)
    deepStrictEqual(en, [
      'Almost.',
      'You got the first one. The second needs a carry.',
      'Number 1. You got it.',
      'Number 2. Let’s look together.',
      'You added the ones but forgot to carry the ten.',
      'Try it again with 10 first.',
    ])
  })

  test('no emoji reaches the voice', () => {
    const { en, zh } = worksheetSpeech(RESULT)
    for (const line of [...en, ...zh]) ok(!/\p{Extended_Pictographic}/u.test(line), line)
  })

  test('the student’s own answer is never announced', () => {
    const { en, zh } = worksheetSpeech(RESULT)
    for (const line of [...en, ...zh]) {
      ok(!line.includes('312'), line)
      ok(!line.includes('42'), line)
    }
  })

  test('next_focus is for the teacher and stays off the speaker', () => {
    const { en, zh } = worksheetSpeech(RESULT)
    ok(![...en, ...zh].some((line) => line.includes('regrouping')))
  })

  test('the Chinese script says only what exists in Chinese', () => {
    const { zh } = worksheetSpeech(RESULT)
    deepStrictEqual(zh, ['快会了。', '第一题对了。第二题要进位。', '第1题：会了。', '第2题：一起看看。'])
  })

  test('an unknown tier falls back rather than throwing', () => {
    const { en } = worksheetSpeech({
      ...RESULT,
      questions: [{ ...RESULT.questions[0]!, quality: 'brilliant' }],
    })
    ok(en.includes('Number 1. Not yet.'))
  })

  test('a half-written or legacy row still produces something sayable', () => {
    const { en, zh } = worksheetSpeech({ summary_en: 'Nice carry.' } as unknown as WorksheetOcr)
    deepStrictEqual(en, ['Nice carry.'])
    deepStrictEqual(zh, [])
  })

  test('an empty result asks for no button at all', () => {
    const { en, zh } = worksheetSpeech({} as unknown as WorksheetOcr)
    strictEqual(en.length, 0)
    strictEqual(zh.length, 0)
  })

  test('a question with no number is still placed in the reading', () => {
    const { en, zh } = worksheetSpeech({
      ...RESULT,
      questions: [{ ...RESULT.questions[0]!, number: null as unknown as number }],
    })
    ok(en.includes('Next question. You got it.'))
    ok(zh.includes('下一题：会了。'))
  })
})

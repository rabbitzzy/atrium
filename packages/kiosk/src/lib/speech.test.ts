/**
 * The two pieces of read-aloud that have judgement in them and no browser in
 * them: which installed voice gets picked, and where a long Debrief is cut into
 * utterances.
 *
 * The rest of `speech.ts` is `speechSynthesis` plumbing, which a test of a mock
 * would only re-state.
 */

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, test } from 'node:test'

import { chunk, paceFor, pickVoice, voiceScore } from './speech'

const voice = (name: string, lang: string) => ({ name, lang })

describe('picking a voice', () => {
  test('prefers a named good voice over another in the same language', () => {
    const picked = pickVoice(
      [voice('English (America)+male1', 'en-US'), voice('Google US English', 'en-US')],
      'en',
    )
    strictEqual(picked?.name, 'Google US English')
  })

  test('prefers the exact locale when no name is recognised', () => {
    const picked = pickVoice([voice('Daniel', 'en-GB'), voice('Alex', 'en-US')], 'en')
    strictEqual(picked?.name, 'Alex')
  })

  test('an unrecognised voice still wins on language alone', () => {
    const picked = pickVoice([voice('Some OEM Voice', 'zh-CN')], 'zh')
    strictEqual(picked?.name, 'Some OEM Voice')
  })

  test('never reads Mandarin prose with a Cantonese voice', () => {
    strictEqual(voiceScore(voice('Sinji', 'zh-HK'), 'zh'), 0)
    strictEqual(pickVoice([voice('Sinji', 'zh-HK')], 'zh'), null)
  })

  test('underscore locale tags are still matched', () => {
    ok(voiceScore(voice('OEM', 'zh_CN'), 'zh') > 0)
  })

  test('no voice for the language means no voice, not a wrong one', () => {
    strictEqual(pickVoice([voice('Alex', 'en-US')], 'zh'), null)
  })
})

describe('pace', () => {
  test('Chinese is read slower than English', () => {
    ok(paceFor('zh', 3) < paceFor('en', 3))
  })

  test('the youngest readers get the slowest reading', () => {
    ok(paceFor('en', 0) < paceFor('en', 3))
    ok(paceFor('en', 1) < paceFor('en', 2))
  })

  test('no grade is the ordinary pace, not the slowest', () => {
    strictEqual(paceFor('en', null), paceFor('en', 5))
  })
})

describe('chunking a script into utterances', () => {
  test('short lines travel together rather than one per utterance', () => {
    deepStrictEqual(chunk(['You got it.', 'You carried the ten every time.']), [
      'You got it. You carried the ten every time.',
    ])
  })

  test('blank and whitespace-only lines are dropped', () => {
    deepStrictEqual(chunk(['', '   ', 'Number 3.']), ['Number 3.'])
  })

  test('a decimal point is not a sentence boundary', () => {
    deepStrictEqual(chunk(['You wrote 2.5 instead of 25.'], 20), ['You wrote 2.5', 'instead of 25.'])
  })

  test('nothing exceeds the cap', () => {
    const long = 'You added the ones but forgot to carry the ten, and that made every answer after it too small. '
    for (const part of chunk([long.repeat(6)], 60)) ok(part.length <= 60, part)
  })

  test('Chinese with no spaces is still cut, at a comma where there is one', () => {
    const parts = chunk(['你把个位加对了，可是忘了进位，所以后面的答案都小了一点。'], 12)
    for (const part of parts) ok(part.length <= 12, part)
    strictEqual(parts.join('').replace(/\s/g, ''), '你把个位加对了，可是忘了进位，所以后面的答案都小了一点。')
  })

  test('an empty script produces nothing to say', () => {
    deepStrictEqual(chunk([]), [])
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CARD_QR_VERSION,
  DECODE_MESSAGE,
  decodeCardQr,
  encodeCardQr,
  type DecodeFailure,
} from './index.js'

const IDENTITY = { studentId: 'stu-42', taskId: '11111111-2222-3333-4444-555555555555' }

describe('the Card QR round trip', () => {
  it('reads back what it wrote', () => {
    const out = decodeCardQr(encodeCardQr(IDENTITY))
    assert.equal(out.ok, true)
    assert.deepEqual(out.ok && out.identity, IDENTITY)
  })

  it('stays small enough to survive a webcam', () => {
    // A QR printed at 22mm and photographed at desk height. Every character
    // raises the module count and shrinks the modules.
    assert.ok(encodeCardQr(IDENTITY).length < 90, encodeCardQr(IDENTITY))
  })

  it('refuses to print a Card that identifies nobody', () => {
    assert.throws(() => encodeCardQr({ studentId: '', taskId: 'x' }), /studentId/)
    assert.throws(() => encodeCardQr({ studentId: 'x', taskId: '' }), /taskId/)
  })
})

describe('decoding something that is not a Card', () => {
  const cases: Array<[string, unknown, DecodeFailure]> = [
    ['nothing at all', null, 'not-a-card'],
    ['an empty string', '', 'not-a-card'],
    ['a plain URL from some other QR', 'https://example.com', 'not-json'],
    ['a JSON array', '[1,2,3]', 'not-a-card'],
    ['a JSON string', '"hello"', 'not-a-card'],
    ['JSON with no version', '{"s":"a","t":"b"}', 'not-a-card'],
    ['a version we do not know', '{"v":99,"s":"a","t":"b"}', 'unsupported-version'],
    ['a version that is not a number', '{"v":"1","s":"a","t":"b"}', 'not-a-card'],
    ['a Card missing its student', '{"v":1,"t":"b"}', 'missing-fields'],
    ['a Card missing its task', '{"v":1,"s":"a"}', 'missing-fields'],
    ['a Card with empty ids', '{"v":1,"s":"","t":""}', 'missing-fields'],
  ]

  for (const [name, input, reason] of cases) {
    it(`says why: ${name}`, () => {
      const out = decodeCardQr(input as string)
      assert.equal(out.ok, false)
      assert.equal(out.ok === false && out.reason, reason)
    })
  }

  // The old format was a bare {studentId, taskId} object, which any JSON with
  // those keys matched. Versioning is what makes an old sheet from a drawer
  // refuse rather than silently attach work to the wrong shape of task.
  it('refuses the unversioned format this replaces', () => {
    const legacy = JSON.stringify({ studentId: 'stu-42', taskId: 'task-1' })
    const out = decodeCardQr(legacy)
    assert.equal(out.ok, false)
  })
})

describe('what the child is told', () => {
  it('has a sentence for every way decoding can fail', () => {
    const reasons: DecodeFailure[] = [
      'not-json',
      'not-a-card',
      'unsupported-version',
      'missing-fields',
    ]
    for (const r of reasons) {
      assert.ok(DECODE_MESSAGE[r].en.length > 10, r)
      assert.ok(DECODE_MESSAGE[r].zh.length > 4, r)
    }
  })

  it('never shows a reason code to a child', () => {
    for (const m of Object.values(DECODE_MESSAGE)) {
      assert.ok(!/[a-z]+-[a-z]+/.test(m.en.replace(/[A-Z]/g, '')) || !m.en.includes('_'))
      assert.ok(!m.en.includes('undefined'))
    }
  })
})

describe('the version constant', () => {
  it('is what encode writes', () => {
    assert.equal(JSON.parse(encodeCardQr(IDENTITY)).v, CARD_QR_VERSION)
  })
})

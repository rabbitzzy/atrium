import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { guard, NOT_A_WORKSHEET, NOT_A_WORKSHEET_SPOKEN } from './guard.js'

const q = (n: number) => ({ number: n, quality: 'mastered', transcript: '42' })

describe('guarding the grade', () => {
  it('lets a real worksheet through', () => {
    assert.deepEqual(guard({ is_worksheet: true, questions: [q(1), q(2)] }), { gradeable: true })
  })

  // The reproduction: a drawing graded as five imaginary questions.
  it('refuses a page the model says is not a worksheet, however well it graded it', () => {
    const drawing = {
      is_worksheet: false,
      not_worksheet_reason: 'a crayon drawing of a dragon',
      questions: [q(1), q(2), q(3), q(4), q(5)],
    }
    const verdict = guard(drawing)
    assert.equal(verdict.gradeable, false)
    assert.equal(verdict.gradeable === false && verdict.reason, 'declared')
    assert.equal(verdict.gradeable === false && verdict.detail, 'a crayon drawing of a dragon')
  })

  it('refuses a page it accepted and then found nothing on', () => {
    const verdict = guard({ is_worksheet: true, questions: [] })
    assert.equal(verdict.gradeable, false)
    assert.equal(verdict.gradeable === false && verdict.reason, 'no-questions')
  })

  it('keeps the two failures apart, because they are different events', () => {
    const declared = guard({ is_worksheet: false, questions: [q(1)] })
    const empty = guard({ is_worksheet: true, questions: [] })
    assert.notEqual(
      declared.gradeable === false && declared.reason,
      empty.gradeable === false && empty.reason,
    )
  })

  // The acceptance case that must not regress: most of a part-done page is
  // blank, and a child who found the Card easy really does get five out of five.
  it('does not punish a part-done page for being mostly empty', () => {
    const partDone = {
      is_worksheet: true,
      questions: [
        { number: 1, quality: 'mastered', transcript: '632' },
        { number: 2, quality: 'not-yet', transcript: '' },
        { number: 3, quality: 'not-yet', transcript: '' },
      ],
    }
    assert.deepEqual(guard(partDone), { gradeable: true })
  })

  it('does not punish a perfect score for looking too good', () => {
    assert.deepEqual(
      guard({ is_worksheet: true, questions: [q(1), q(2), q(3), q(4), q(5)] }),
      { gradeable: true },
    )
  })

  // Rows written before this schema existed were all real worksheets; refusing
  // them retroactively would blank a child's history.
  it('treats a row from before the guard as a worksheet', () => {
    assert.deepEqual(guard({ questions: [q(1)] }), { gradeable: true })
    assert.deepEqual(guard({ is_worksheet: null, questions: [q(1)] }), { gradeable: true })
  })

  it('does not refuse a row that simply has no questions field yet', () => {
    // Mid-stream: the array has not arrived, which is not the same as empty.
    assert.deepEqual(guard({ is_worksheet: true }), { gradeable: true })
  })

  it('survives a missing reason', () => {
    const verdict = guard({ is_worksheet: false })
    assert.equal(verdict.gradeable, false)
    assert.equal(verdict.gradeable === false && verdict.detail, null)
  })
})

describe('what the child is told', () => {
  it('never blames them and never says error', () => {
    const all = [
      NOT_A_WORKSHEET.titleEn,
      NOT_A_WORKSHEET.bodyEn,
      ...NOT_A_WORKSHEET_SPOKEN.en,
    ].join(' ').toLowerCase()
    for (const word of ['error', 'invalid', 'failed', 'wrong', 'bad', 'cannot process']) {
      assert.ok(!all.includes(word), `should not say "${word}"`)
    }
  })

  it('points at the thing they probably wanted', () => {
    assert.ok(NOT_A_WORKSHEET.bodyEn.includes('drawing'))
    assert.ok(NOT_A_WORKSHEET.bodyZh.includes('画'))
  })

  it('tells them how to retry if it really was their Card', () => {
    assert.ok(NOT_A_WORKSHEET.bodyEn.includes('four corners'))
  })

  it('says it in both languages, on screen and out loud', () => {
    assert.ok(NOT_A_WORKSHEET.titleZh.length > 3)
    assert.ok(NOT_A_WORKSHEET_SPOKEN.zh.length > 0)
  })

  // A child who has just been told the machine cannot read their page will not
  // sit through the screen text read back at them.
  it('is shorter out loud than on screen', () => {
    assert.ok(NOT_A_WORKSHEET_SPOKEN.en.join(' ').length < NOT_A_WORKSHEET.bodyEn.length)
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isFailure, jobState, lpArgs, parseJobId, parsePrinterReady } from './cups.js'

const PRINTER = 'HP_ENVY_5000_series__A84B0E_'

describe('what we ask lp for', () => {
  const args = lpArgs({ printer: PRINTER, title: 'Card abc' })

  it('always asks for exactly one copy', () => {
    assert.deepEqual(args.slice(args.indexOf('-n'), args.indexOf('-n') + 2), ['-n', '1'])
  })

  // The acceptance says "no way to print twenty copies". The count is not a
  // parameter this agent accepts, so there is nothing to pass twenty to.
  it('takes no copy count from its caller', () => {
    const keys = Object.keys({ printer: '', title: '', sides: '', hold: '' })
    assert.ok(!keys.includes('copies'))
  })

  it('always prints Cards single-sided', () => {
    assert.ok(args.includes('sides=one-sided'))
  })

  it('names the job so a jam can be traced back to a Card', () => {
    assert.ok(args.includes('Card abc'))
  })

  it('can hold a job, which is how this is tested without paper', () => {
    assert.ok(lpArgs({ printer: PRINTER, title: 't', hold: true }).includes('hold'))
    assert.ok(!lpArgs({ printer: PRINTER, title: 't' }).includes('hold'))
  })
})

describe('reading lp back', () => {
  it('finds the job id in the one line lp prints', () => {
    assert.equal(parseJobId('request id is HP_ENVY-59 (1 file(s))'), 'HP_ENVY-59')
  })
  it('returns null rather than a wrong id when lp said something else', () => {
    assert.equal(parseJobId('lp: Error - no default destination'), null)
  })
})

describe('reading a job’s fate from what lpstat really prints', () => {
  // Verbatim shape of `lpstat -o`: no state column, which the first draft of
  // this parser assumed there was.
  const row = (id: string) => `${id} zhenyanzhu        1024   Tue Aug 18 20:04:19 2026`

  it('calls a job in a working queue active', () => {
    assert.equal(
      jobState({ notCompleted: row('HP-61'), completed: '', printerReady: true }, 'HP-61'),
      'active',
    )
  })

  // The case the Leaf refund exists for, and the only failure CUPS can prove.
  it('calls a job stuck behind a disabled queue stuck', () => {
    const state = jobState(
      { notCompleted: row('HP-61'), completed: '', printerReady: false },
      'HP-61',
    )
    assert.equal(state, 'stuck')
    assert.equal(isFailure(state), true)
  })

  it('calls a job that left the queue finished', () => {
    assert.equal(
      jobState({ notCompleted: '', completed: row('HP-61'), printerReady: true }, 'HP-61'),
      'finished',
    )
    assert.equal(isFailure('finished'), false)
  })

  // Refunding a Card that actually printed is worse than missing one that did
  // not: it hands out free paper and teaches that the loop is optional.
  it('treats a job aged out of CUPS history as finished, not failed', () => {
    assert.equal(jobState({ notCompleted: '', completed: '', printerReady: true }, 'HP-99'), 'finished')
  })

  it('does not mistake one job id for another that shares a prefix', () => {
    const snap = { notCompleted: row('HP-6'), completed: '', printerReady: true }
    assert.equal(jobState(snap, 'HP-61'), 'finished')
  })

  it('never claims a moving job has failed', () => {
    for (const s of ['active', 'finished', 'unknown'] as const) assert.equal(isFailure(s), false)
  })
})

describe('is the printer able to take a job', () => {
  it('accepts an idle or working queue', () => {
    assert.equal(parsePrinterReady(`printer ${PRINTER} is idle.  enabled since Tue`, PRINTER), true)
    assert.equal(parsePrinterReady(`printer ${PRINTER} now printing ${PRINTER}-3.`, PRINTER), true)
  })

  // Out of paper, jammed, offline — the cases the Leaf refund exists for, and
  // the reason to check before the child is charged rather than after.
  it('refuses a disabled queue', () => {
    assert.equal(parsePrinterReady(`printer ${PRINTER} disabled since Tue - Out of paper`, PRINTER), false)
  })

  it('refuses a printer it cannot see at all', () => {
    assert.equal(parsePrinterReady('printer OTHER is idle.', PRINTER), false)
  })
})

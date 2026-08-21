import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { beginBusy, isBusy, resetBusy } from './busy.js'

beforeEach(() => resetBusy())

describe('declaring a wait', () => {
  it('is not busy until something says so', () => {
    assert.equal(isBusy(), false)
  })

  it('is busy from the call until the release', () => {
    const done = beginBusy()
    assert.equal(isBusy(), true)
    done()
    assert.equal(isBusy(), false)
  })

  // A scan uploading while a Card generates: whichever finishes first must not
  // clear the other one's wait and hand the visit to the idle timer.
  it('stays busy while a second wait is still running', () => {
    const a = beginBusy()
    const b = beginBusy()
    a()
    assert.equal(isBusy(), true)
    b()
    assert.equal(isBusy(), false)
  })

  // A `finally` that runs after an early return should not be able to drive the
  // count below zero and leave the next wait unprotected.
  it('ignores a release called twice', () => {
    const a = beginBusy()
    const b = beginBusy()
    a()
    a()
    a()
    assert.equal(isBusy(), true)
    b()
    assert.equal(isBusy(), false)
  })

  it('never goes negative', () => {
    const done = beginBusy()
    done()
    const other = beginBusy()
    assert.equal(isBusy(), true)
    other()
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chooseDeskMode, nextDeskState, type DeskState } from './desk-mode'

const AUTO: DeskState = { mode: 'get', pinned: null }

describe('following the desk', () => {
  it('shows scan when a page is there', () => {
    assert.equal(nextDeskState(AUTO, true).mode, 'scan')
  })

  it('goes back to the doors when the desk empties', () => {
    assert.equal(nextDeskState({ mode: 'scan', pinned: null }, false).mode, 'get')
  })

  it('leaves a matching mode alone', () => {
    const s = { mode: 'scan', pinned: null } as const
    assert.equal(nextDeskState(s, true), s)
  })
})

describe('never arguing with a button that was just pressed', () => {
  // The bug: press "Get worksheet" while the page is still lying there, and
  // detection dragged the screen straight back to scan. From the front that is
  // a control that does not work.
  it('holds the doors open while the page is still on the desk', () => {
    let s = chooseDeskMode('get')
    for (let tick = 0; tick < 20; tick++) s = nextDeskState(s, true)
    assert.equal(s.mode, 'get')
  })

  // And the mirror, which was the half that already worked.
  it('holds scan open while the child is still finding their page', () => {
    let s = chooseDeskMode('scan')
    for (let tick = 0; tick < 20; tick++) s = nextDeskState(s, false)
    assert.equal(s.mode, 'scan')
  })
})

describe('handing the wheel back', () => {
  it('releases the pin once the desk agrees, without a timer', () => {
    let s = chooseDeskMode('get')
    s = nextDeskState(s, true)
    assert.equal(s.pinned, 'get', 'still held while the page is there')
    s = nextDeskState(s, false)
    assert.equal(s.pinned, null, 'desk agrees, so the pin is spent')
  })

  it('follows the desk again after the pin is released', () => {
    let s = chooseDeskMode('get')
    s = nextDeskState(s, false) // page taken away → pin released
    s = nextDeskState(s, true) // page put back → automatic again
    assert.equal(s.mode, 'scan')
  })

  it('does the same for a pinned scan', () => {
    let s = chooseDeskMode('scan')
    s = nextDeskState(s, true) // page arrives → pin released
    assert.equal(s.pinned, null)
    s = nextDeskState(s, false) // page leaves → automatic again
    assert.equal(s.mode, 'get')
  })
})

describe('the pin never strands anyone', () => {
  it('cannot leave a mode pinned against a desk that keeps agreeing', () => {
    for (const asked of ['get', 'scan'] as const) {
      let s = chooseDeskMode(asked)
      for (let i = 0; i < 6; i++) s = nextDeskState(s, asked === 'scan')
      assert.equal(s.pinned, null, `${asked} should release once the desk matches`)
    }
  })

  it('is total — any state and any signal returns a valid state', () => {
    for (const mode of ['get', 'scan'] as const) {
      for (const pinned of ['get', 'scan', null] as const) {
        for (const saw of [true, false]) {
          const out = nextDeskState({ mode, pinned }, saw)
          assert.ok(out.mode === 'get' || out.mode === 'scan')
        }
      }
    }
  })
})

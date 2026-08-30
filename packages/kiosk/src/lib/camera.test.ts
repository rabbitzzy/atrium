import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { preferredCamera } from './camera'

/**
 * `preferredCamera` reads a remembered label from localStorage, which Node does
 * not have. A minimal stand-in keeps the test honest about that path instead of
 * only exercising the half that ignores it.
 */
const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}

beforeEach(() => store.clear())

const cam = (label: string, deviceId = label) => ({ deviceId, label })

describe('which camera the station opens', () => {
  test('nothing to choose from is null, not a guess', () => {
    assert.equal(preferredCamera([]), null)
  })

  test('a document camera wins — it is the one certainly aimed at paper', () => {
    const picked = preferredCamera([cam('FaceTime HD Camera'), cam('OKIOCAM S2 Pro')])
    assert.equal(picked?.label, 'OKIOCAM S2 Pro')
  })

  test('on a phone, the back camera — never the one facing the child', () => {
    // iOS orders the front camera first, so falling through to cameras[0]
    // pointed the kiosk at the student instead of their work.
    const picked = preferredCamera([cam('Front Camera'), cam('Back Camera')])
    assert.equal(picked?.label, 'Back Camera')
  })

  test('a back camera with a longer name is still a back camera', () => {
    const picked = preferredCamera([cam('Front Camera'), cam('Back Dual Wide Camera')])
    assert.equal(picked?.label, 'Back Dual Wide Camera')
  })

  test('with only a front camera, anything unlabelled beats it', () => {
    const picked = preferredCamera([cam('Front Camera'), cam('Camera 2')])
    assert.equal(picked?.label, 'Camera 2')
  })

  test('a front camera alone is still returned — one camera is the camera', () => {
    const picked = preferredCamera([cam('Front Camera')])
    assert.equal(picked?.label, 'Front Camera')
  })

  test('a remembered choice wins over every heuristic', () => {
    store.set('atrium.camera.label', 'FaceTime HD Camera')
    const picked = preferredCamera([cam('FaceTime HD Camera'), cam('OKIOCAM S2 Pro')])
    assert.equal(picked?.label, 'FaceTime HD Camera')
  })

  test('a remembered camera that is no longer plugged in is ignored', () => {
    store.set('atrium.camera.label', 'OKIOCAM S2 Pro')
    const picked = preferredCamera([cam('Front Camera'), cam('Back Camera')])
    assert.equal(picked?.label, 'Back Camera')
  })
})

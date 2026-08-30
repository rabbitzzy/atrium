import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  PrintAgentUnreachable,
  PrintRefused,
  printAgentUrl,
  printCard,
  trayState,
} from './printer'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** Stand in for the print agent without opening a socket. */
function agent(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = ((url: string, init?: RequestInit) =>
    Promise.resolve(handler(String(url), init))) as typeof fetch
}

function unreachable() {
  globalThis.fetch = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch
}

describe('where the print agent is', () => {
  test('falls back to loopback when the station has no storage', () => {
    // Node has no localStorage, which is the same shape as a browser that has
    // it disabled: the station still prints rather than throwing.
    assert.equal(printAgentUrl(), 'http://127.0.0.1:3003')
  })
})

describe('checking the tray before a Leaf is spent', () => {
  test('a ready printer is ready', async () => {
    agent(() => Response.json({ ok: true, printer: 'Atrium', ready: true }))
    assert.deepEqual(await trayState(), { ready: true, printer: 'Atrium' })
  })

  test('no paper is a real answer, not a missing one', async () => {
    agent(() => Response.json({ ok: true, printer: 'Atrium', ready: false }))
    assert.deepEqual(await trayState(), { ready: false, printer: 'Atrium' })
  })

  test('an unreachable agent is told apart from an unready printer', async () => {
    // Null rather than { ready: false }, because "this station cannot find its
    // printer" and "the printer has no paper" are fixed by different people.
    unreachable()
    assert.equal(await trayState(), null)
  })

  test('a printer with no name configured is never ready', async () => {
    agent(() => Response.json({ ok: true, printer: null, ready: false }))
    assert.deepEqual(await trayState(), { ready: false, printer: null })
  })

  test('missing readiness is treated as not ready, never as yes', async () => {
    agent(() => Response.json({ ok: true }))
    assert.deepEqual(await trayState(), { ready: false, printer: null })
  })
})

describe('printing a Card', () => {
  const pdf = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' })

  test('returns the job id the agent gave it', async () => {
    agent(() => Response.json({ jobId: 'Atrium-42', held: false }))
    assert.deepEqual(await printCard(pdf, { title: 'Atrium Card abc' }), { jobId: 'Atrium-42' })
  })

  test('sends the title, and the hold flag only when asked', async () => {
    let seen = ''
    agent((url) => {
      seen = url
      return Response.json({ jobId: 'j1' })
    })

    await printCard(pdf, { title: 'Atrium Card abc' })
    assert.ok(seen.includes('title=Atrium+Card+abc'))
    assert.ok(!seen.includes('hold'))

    await printCard(pdf, { title: 'Atrium Card abc', hold: true })
    assert.ok(seen.includes('hold=1'))
  })

  test('a refusal carries what the agent actually said', async () => {
    // The whole diagnosis is in the message; a bare "print failed" sent someone
    // hunting a network fault once already.
    agent(() => Response.json({ error: 'printer_not_ready' }, { status: 503 }))
    await assert.rejects(() => printCard(pdf, { title: 't' }), (err: unknown) => {
      assert.ok(err instanceof PrintRefused)
      assert.match((err as Error).message, /printer_not_ready/)
      return true
    })
  })

  test('an absent agent is a different failure from a refusing one', async () => {
    unreachable()
    await assert.rejects(() => printCard(pdf, { title: 't' }), (err: unknown) => {
      assert.ok(err instanceof PrintAgentUnreachable)
      assert.ok(!(err instanceof PrintRefused))
      return true
    })
  })

  test('a success with an unreadable body still counts as printed', async () => {
    // The paper is out by then. Failing here would tell a child their Card was
    // lost while it sits in the tray.
    agent(() => new Response('not json', { status: 200 }))
    assert.deepEqual(await printCard(pdf, { title: 't' }), { jobId: null })
  })
})

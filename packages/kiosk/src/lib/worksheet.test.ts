import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateCard,
  InsufficientLeaves,
  NoRoomToAssign,
  previewCard,
  WorksheetRefused,
  WorksheetUnreachable,
  worksheetUrl,
} from './worksheet'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function service(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = ((url: string, init?: RequestInit) =>
    Promise.resolve(handler(String(url), init))) as typeof fetch
}

function unreachable() {
  globalThis.fetch = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch
}

/** What worksheet-print actually answers with: a PDF body, counts in headers. */
function cardResponse(rooms: string, leaves: string) {
  return new Response(new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])]), {
    status: 200,
    headers: { 'content-type': 'application/pdf', 'x-atrium-rooms': rooms, 'x-atrium-leaves': leaves },
  })
}

describe('where the worksheet service is', () => {
  test('falls back to loopback when the station has no storage', () => {
    assert.equal(worksheetUrl(), 'http://127.0.0.1:3002')
  })
})

describe('generating a Card', () => {
  const args = { studentId: 's1', taskId: 't1' }

  test('returns the PDF and what it cost', async () => {
    service(() => cardResponse('math/ops/add-2digit,lang/en/phonics/cvc-words', '3'))
    const card = await generateCard(args)
    assert.equal(card.taskId, 't1')
    assert.equal(card.leavesLeft, 3)
    assert.deepEqual(card.rooms, ['math/ops/add-2digit', 'lang/en/phonics/cvc-words'])
    assert.equal(await card.pdf.text(), '%PDF')
  })

  test('a Card with no rooms header is empty, not [""]', async () => {
    service(() => new Response(new Blob(['x']), { status: 200 }))
    assert.deepEqual((await generateCard(args)).rooms, [])
  })

  test('passes the subject only when a door was pressed', async () => {
    let sent: Record<string, unknown> = {}
    service((_u, init) => {
      sent = JSON.parse(String(init?.body))
      return cardResponse('r', '1')
    })

    await generateCard(args)
    assert.ok(!('subject' in sent))

    await generateCard({ ...args, subject: 'math' })
    assert.equal(sent['subject'], 'math')
  })

  test('402 is a Leaf balance, carried so the screen can name it', async () => {
    // Not an error the child caused, and never rendered as a refusal.
    service(() => Response.json({ error: 'insufficient_leaves', balance: 0 }, { status: 402 }))
    await assert.rejects(() => generateCard(args), (err: unknown) => {
      assert.ok(err instanceof InsufficientLeaves)
      assert.equal((err as InsufficientLeaves).balance, 0)
      return true
    })
  })

  test('409 is the planner declining, not a fault', async () => {
    service(() => Response.json({ error: 'no_room_to_assign', detail: 'everything mastered' }, { status: 409 }))
    await assert.rejects(() => generateCard(args), (err: unknown) => {
      assert.ok(err instanceof NoRoomToAssign)
      assert.match((err as Error).message, /mastered/)
      return true
    })
  })

  test('other refusals keep the detail the service gave', async () => {
    service(() => Response.json({ error: 'generation_failed', detail: 'model timed out' }, { status: 502 }))
    await assert.rejects(() => generateCard(args), (err: unknown) => {
      assert.ok(err instanceof WorksheetRefused)
      assert.match((err as Error).message, /model timed out/)
      return true
    })
  })

  test('an absent service is told apart from a refusing one', async () => {
    unreachable()
    await assert.rejects(() => generateCard(args), (err: unknown) => {
      assert.ok(err instanceof WorksheetUnreachable)
      assert.ok(!(err instanceof WorksheetRefused))
      return true
    })
  })
})

describe('rehearsing a Card', () => {
  const args = { studentId: 's1', taskId: 't1' }

  test('asks for a preview and returns the markup', async () => {
    let sent: Record<string, unknown> = {}
    service((_u, init) => {
      sent = JSON.parse(String(init?.body))
      return Response.json({ taskId: 't1', html: '<h1>Card</h1>', rooms: ['math/ops'], leavesLeft: 2 })
    })

    const card = await previewCard(args)
    assert.equal(sent['preview'], true)
    assert.equal(card.html, '<h1>Card</h1>')
    assert.deepEqual(card.rooms, ['math/ops'])
    assert.equal(card.leavesLeft, 2)
  })

  test('a rehearsal at zero Leaves is refused like any other', async () => {
    // A rehearsal exercises the economy rather than sidestepping it.
    service(() => Response.json({ error: 'insufficient_leaves', balance: 0 }, { status: 402 }))
    await assert.rejects(() => previewCard(args), InsufficientLeaves)
  })
})

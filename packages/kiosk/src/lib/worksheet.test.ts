import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateCard,
  InsufficientLeaves,
  NoRoomToAssign,
  WorksheetRefused,
  WorksheetUnreachable,
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

/** What worksheet-print answers with: the Card as markup, and what it cost. */
function cardResponse(rooms: string[], leaves: number) {
  return Response.json({ taskId: 't1', html: '<html>card</html>', rooms, leavesLeft: leaves })
}

describe('generating a Card', () => {
  const args = { studentId: 's1', taskId: 't1' }

  test('returns the Card and what it cost', async () => {
    service(() => cardResponse(['math/ops/add-2digit', 'lang/en/phonics/cvc-words'], 3))
    const card = await generateCard(args)
    assert.equal(card.taskId, 't1')
    assert.equal(card.leavesLeft, 3)
    assert.deepEqual(card.rooms, ['math/ops/add-2digit', 'lang/en/phonics/cvc-words'])
    assert.equal(card.html, '<html>card</html>')
  })

  test('a Card that names no rooms is empty, not undefined', async () => {
    service(() => Response.json({ taskId: 't1', html: '<html></html>' }))
    const card = await generateCard(args)
    assert.deepEqual(card.rooms, [])
    assert.equal(card.leavesLeft, 0)
  })

  test('passes the subject only when a door was pressed', async () => {
    let sent: Record<string, unknown> = {}
    service((_u, init) => {
      sent = JSON.parse(String(init?.body))
      return cardResponse(['r'], 1)
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


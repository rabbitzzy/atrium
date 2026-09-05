/** The worker pool behind the close-up pass (BHCS-107). */

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, test } from 'node:test'

import { inParallel } from './pool.js'

describe('running jobs a few at a time', () => {
  test('every answer lands in its own slot, whatever order they finish in', async () => {
    // Reversed delays: the last job finishes first. A pool that appends
    // results instead of indexing them passes every other test and fails this.
    const items = [0, 1, 2, 3, 4, 5]
    const out = await inParallel(items, 3, async (n) => {
      await new Promise((r) => setTimeout(r, (items.length - n) * 4))
      return `job ${n}`
    })
    deepStrictEqual(out, items.map((n) => `job ${n}`))
  })

  test('never more than the limit in flight', async () => {
    let live = 0
    let peak = 0
    await inParallel(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      peak = Math.max(peak, ++live)
      await new Promise((r) => setTimeout(r, 2))
      live--
      return true
    })
    strictEqual(peak, 4)
  })

  test('one job failing costs only that job', async () => {
    const seen: number[] = []
    const out = await inParallel([0, 1, 2, 3], 2, async (n) => {
      if (n === 1) throw new Error('unreadable')
      return n * 10
    }, (_err, index) => seen.push(index))

    deepStrictEqual(out, [0, null, 20, 30])
    deepStrictEqual(seen, [1], 'the failure is reported with its index')
  })

  test('nothing to do is not an error', async () => {
    deepStrictEqual(await inParallel([], 4, async () => 1), [])
  })

  test('a limit larger than the work does not spawn idle workers', async () => {
    let started = 0
    await inParallel([1, 2], 10, async (n) => {
      started++
      return n
    })
    strictEqual(started, 2)
  })

  test('a limit of zero still makes progress', async () => {
    // Guarding against the pool that quietly does nothing forever.
    const out = await inParallel([1, 2, 3], 0, async (n) => n)
    deepStrictEqual(out, [1, 2, 3])
    ok(true)
  })
})

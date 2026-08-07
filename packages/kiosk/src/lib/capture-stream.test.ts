/**
 * The stream reader, against the two things a network actually does: split a
 * frame across chunk boundaries, and stop halfway through.
 */

import { deepStrictEqual, rejects, strictEqual } from 'node:assert/strict'
import { describe, test } from 'node:test'

import { CaptureStreamError, isEventStream, readCaptureStream } from './capture-stream'

const DONE = {
  captureId: 'c1',
  fileUrl: 'https://example.test/c1.jpg',
  storageBackend: 'local',
  kind: 'worksheet',
  ocrStatus: 'ok',
  ocrError: null,
  ocrMs: 1234,
  ocr: { questions: [{ number: 1 }] },
}

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

/** An SSE response whose body arrives in exactly these pieces. */
function response(chunks: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } },
  )
}

const collect = async (chunks: string[]) => {
  const partials: unknown[] = []
  const result = await readCaptureStream(response(chunks), (p) => partials.push(p))
  return { partials, result }
}

describe('reading a capture stream', () => {
  test('partials arrive in order, then the result', async () => {
    const { partials, result } = await collect([
      ': open\n\n',
      frame('stored', { captureId: 'c1', fileUrl: 'x', storageBackend: 'local' }),
      frame('partial', { questions: [{ number: 1 }] }),
      frame('partial', { questions: [{ number: 1 }, { number: 2 }] }),
      frame('done', DONE),
    ])

    deepStrictEqual(partials, [{ questions: [{ number: 1 }] }, { questions: [{ number: 1 }, { number: 2 }] }])
    deepStrictEqual(result, DONE)
  })

  test('a frame split across chunks is still one frame', async () => {
    // The realistic failure: TCP does not respect message boundaries, and a
    // reader that assumes it does drops or duplicates the frame at the seam.
    const whole = frame('partial', { summary_en: 'Nice work — 好样的' }) + frame('done', DONE)
    const { partials, result } = await collect(
      Array.from({ length: whole.length }, (_, i) => whole[i]!), // one character at a time
    )

    deepStrictEqual(partials, [{ summary_en: 'Nice work — 好样的' }])
    deepStrictEqual(result, DONE)
  })

  test('several frames in one chunk are several frames', async () => {
    const { partials } = await collect([frame('partial', { a: 1 }) + frame('partial', { a: 2 }) + frame('done', DONE)])
    deepStrictEqual(partials, [{ a: 1 }, { a: 2 }])
  })

  test('an error event is thrown, not returned', async () => {
    await rejects(
      () => collect([frame('stored', DONE), frame('error', { error: 'Gemini error 429' })]),
      (err: CaptureStreamError) => {
        strictEqual(err.message, 'Gemini error 429')
        // Already stored: the operator needs to know the page is not lost.
        strictEqual(err.stored, true)
        return true
      },
    )
  })

  test('a stream that just stops says whether the page survived', async () => {
    await rejects(
      () => collect([frame('stored', DONE), frame('partial', { a: 1 })]),
      (err: CaptureStreamError) => err.stored && /saved/.test(err.message),
    )
    await rejects(
      () => collect([': open\n\n']),
      (err: CaptureStreamError) => !err.stored && /before the page was saved/.test(err.message),
    )
  })
})

describe('choosing the transport', () => {
  test('reads the content type, not the app id', () => {
    strictEqual(isEventStream(response([])), true)
    strictEqual(isEventStream(new Response('{}', { headers: { 'Content-Type': 'application/json' } })), false)
    strictEqual(isEventStream(new Response('{}')), false)
  })
})

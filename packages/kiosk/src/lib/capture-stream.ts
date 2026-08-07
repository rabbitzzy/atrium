/**
 * Read a streamed capture response (BHCS-10).
 *
 * `EventSource` cannot be used: it only issues GETs, and a capture is a POST
 * carrying a two-megabyte image. So the frames are read off the fetch body
 * directly, which is a dozen lines and also means no reconnect logic — a
 * capture is one shot, and a silently retried one would double-charge the
 * model and duplicate the row.
 *
 * The platform half of the feature ends here. What is inside a `partial` is
 * the handling app's business; this file never looks.
 */

import type { CaptureResponse, CaptureStreamEvent } from '@atrium/schema'

/** Set when the image is known to have survived a failure. */
export class CaptureStreamError extends Error {
  constructor(message: string, readonly stored: boolean) {
    super(message)
    this.name = 'CaptureStreamError'
  }
}

export function isEventStream(res: Response): boolean {
  return res.headers.get('content-type')?.includes('text/event-stream') ?? false
}

/**
 * Resolve with the same object the buffered path returns, calling `onPartial`
 * with each intermediate reading on the way.
 */
export async function readCaptureStream(
  res: Response,
  onPartial: (partial: unknown) => void,
): Promise<CaptureResponse> {
  if (!res.body) throw new CaptureStreamError('The kiosk got an empty response', false)

  let stored = false

  for await (const { event, data } of sseEvents(res.body)) {
    switch (event) {
      case 'stored':
        stored = true
        break
      case 'partial':
        onPartial(data)
        break
      case 'done':
        return data
      case 'error':
        throw new CaptureStreamError(data.error, stored)
    }
  }

  // The stream ended without a verdict — the function timed out, or the
  // connection dropped. Whether the pixels made it is the one thing worth
  // saying, because it decides whether re-shooting is necessary.
  throw new CaptureStreamError(
    stored
      ? 'The reading was cut off partway. The page is saved and can be read again later.'
      : 'The connection dropped before the page was saved.',
    stored,
  )
}

async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<CaptureStreamEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })

      // Frames are blank-line delimited; anything after the last blank line is
      // a frame still arriving and stays in the buffer.
      let split: number
      while ((split = buffer.indexOf('\n\n')) !== -1) {
        const frame = parseFrame(buffer.slice(0, split))
        buffer = buffer.slice(split + 2)
        if (frame) yield frame
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }
}

/** One frame: `event:` and `data:` lines. Comments (`:` …) are keep-alives. */
function parseFrame(frame: string): CaptureStreamEvent | undefined {
  let event = ''
  let data = ''
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data += line.slice(5).trim()
  }
  if (!event || !data) return undefined

  try {
    return { event, data: JSON.parse(data) } as CaptureStreamEvent
  } catch {
    return undefined
  }
}

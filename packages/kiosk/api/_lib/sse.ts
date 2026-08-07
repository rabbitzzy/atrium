/**
 * Server-sent events out of a capture function.
 *
 * The platform's half of BHCS-10: a way to answer a request in instalments.
 * It knows nothing about what is being streamed — the events carry opaque
 * payloads, exactly as `captures.ocr_json` does.
 *
 * SSE rather than a WebSocket because the traffic is one-way, one-shot, and
 * over in twenty seconds; a socket would mean connection state the kiosk does
 * not otherwise need. It is also the one streaming shape a Vercel Node
 * function supports without changing runtime.
 */

import type { VercelResponse } from '@vercel/node'

export interface SseStream {
  /** Named event, JSON payload. Safe to call after the client has gone. */
  send(event: string, data: unknown): void
  close(): void
}

export function openSse(res: VercelResponse): SseStream {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  // `no-transform` and `X-Accel-Buffering` are the two that matter in
  // production: without them a proxy is free to buffer the whole response and
  // hand it over at the end, which is precisely the behaviour being replaced.
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  // A comment frame, so the headers and a first byte leave immediately rather
  // than waiting on the storage write and the model's first token.
  write(res, ': open\n\n')

  let open = true
  return {
    send(event, data) {
      if (!open) return
      write(res, `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    },
    close() {
      if (!open) return
      open = false
      res.end()
    },
  }
}

/**
 * A dead socket is not an error worth propagating: the capture is stored and
 * the row is written either way, and there is nobody left to tell.
 */
function write(res: VercelResponse, chunk: string): void {
  try {
    res.write(chunk)
  } catch {
    /* client gone */
  }
}

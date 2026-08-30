/**
 * Run a Vercel-style handler inside a Hono app.
 *
 * ── Why this exists ──
 *
 * Vercel makes one Serverless Function per file under `api/`, and the Hobby
 * plan allows twelve per deployment. The kiosk had sixteen routes, so the
 * deploy was refused outright — not at build time, where it might have been
 * noticed, but at the step that uploads the built output.
 *
 * Rather than delete routes or pay for the limit, all of them are now mounted
 * on one Hono app behind a single catch-all function (`api/[...path].ts`). The
 * handlers themselves are unchanged: each one is still a
 * `(req: VercelRequest, res: VercelResponse)` function, still lives in its own
 * file, and is still readable on its own. This adapter is the seam that lets
 * them keep that shape while the platform sees one function.
 *
 * A second benefit falls out of it. `student-state.ts` used to make three
 * HTTPS calls to `/api/skill-graph` — a request leaving the datacentre and
 * coming back to the same deployment, three times, because the two halves were
 * separate functions. Mounted together they are one process, so those become
 * in-process dispatches.
 *
 * ── Why the response is a real Node stream ──
 *
 * Collecting the body into a buffer would be simpler and would break two
 * routes. `capture.ts` answers in instalments over SSE (`_lib/sse.ts`), where
 * the whole point is that bytes leave before the work finishes; buffering it
 * would restore exactly the behaviour SSE was introduced to replace.
 * `capture-file.ts` does `createReadStream(file).pipe(res)`, which needs a
 * genuine writable on the other end.
 *
 * So the fake response *is* a `PassThrough`, and `write`, `end` and `pipe` are
 * its own methods rather than imitations. The web `Response` is built at the
 * first byte — the moment the handler has finished setting status and headers
 * and committed to a body — and streams from there.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { PassThrough, Readable } from 'node:stream'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown

/** Build the request shape the handlers read: method, query, headers, body. */
async function toVercelRequest(request: Request): Promise<VercelRequest> {
  const url = new URL(request.url)

  // Repeated keys arrive as an array, the way Vercel presents them. Handlers
  // narrow with `typeof x === 'string'`, so this must not flatten them into a
  // single value and make a duplicated parameter look legitimate.
  const query: Record<string, string | string[]> = {}
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key)
    query[key] = all.length > 1 ? all : (all[0] as string)
  }

  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })

  // Vercel parses JSON bodies before the handler sees them. A body that is not
  // JSON is left as text rather than throwing: the handlers validate what they
  // get, and a parse error here would answer 500 to something that deserves a
  // 400 from the route itself.
  let body: unknown
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const raw = await request.text()
    if (raw) {
      try {
        body = JSON.parse(raw)
      } catch {
        body = raw
      }
    }
  }

  return { method: request.method, query, headers, body, url: url.pathname } as unknown as VercelRequest
}

/**
 * Wrap one handler as a Hono-compatible fetch function.
 *
 * Resolves as soon as the handler commits to a response, not when it finishes:
 * a streaming route keeps writing long after its headers are out.
 */
export function fromVercel(handler: Handler) {
  return async (request: Request): Promise<Response> => {
    const req = await toVercelRequest(request)
    const stream = new PassThrough()
    const headers = new Headers()

    let started = false
    let resolveResponse!: (r: Response) => void
    let rejectResponse!: (e: unknown) => void
    const response = new Promise<Response>((resolve, reject) => {
      resolveResponse = resolve
      rejectResponse = reject
    })

    /** The first byte settles status and headers; everything after is body. */
    const begin = () => {
      if (started) return
      started = true

      // 204/205/304 and HEAD must carry no body at all — the Response
      // constructor throws if handed one, and that throw used to happen inside
      // the handler's own call to `end()`, leaving the response promise
      // unresolved and the request hanging forever. `/api/print-outcome`
      // answers 204 on every report, so this is not a corner case.
      const bodyless =
        request.method === 'HEAD' ||
        res.statusCode === 204 ||
        res.statusCode === 205 ||
        res.statusCode === 304

      resolveResponse(
        new Response(bodyless ? null : (Readable.toWeb(stream) as ReadableStream), {
          status: res.statusCode,
          headers,
        }),
      )
    }

    const write = stream.write.bind(stream)
    const end = stream.end.bind(stream)

    const res = Object.assign(stream, {
      statusCode: 200,

      status(code: number) {
        res.statusCode = code
        return res
      },
      setHeader(name: string, value: number | string | readonly string[]) {
        headers.set(name, Array.isArray(value) ? value.join(', ') : String(value))
        return res
      },
      getHeader(name: string) {
        return headers.get(name) ?? undefined
      },
      removeHeader(name: string) {
        headers.delete(name)
      },
      // SSE calls this to get headers out before the first payload. The stream
      // is already the response body, so committing now is all it means here.
      flushHeaders() {
        begin()
      },
      write(chunk: string | Uint8Array, ...rest: unknown[]) {
        begin()
        return (write as (c: unknown, ...r: unknown[]) => boolean)(chunk, ...rest)
      },
      end(chunk?: string | Uint8Array, ...rest: unknown[]) {
        begin()
        return (end as (c?: unknown, ...r: unknown[]) => unknown)(chunk, ...rest)
      },
      json(payload: unknown) {
        if (!headers.has('content-type')) {
          headers.set('content-type', 'application/json; charset=utf-8')
        }
        res.end(JSON.stringify(payload))
        return res
      },
      send(payload: unknown) {
        if (payload === undefined || payload === null) {
          res.end()
        } else if (typeof payload === 'string' || payload instanceof Uint8Array) {
          res.end(payload)
        } else {
          res.json(payload)
        }
        return res
      },
    }) as unknown as VercelResponse

    // A handler that throws before writing anything has produced no response at
    // all, so the rejection has to travel rather than leaving the promise
    // pending forever. One that throws *after* committing has already sent its
    // status; all that is left is to stop the stream.
    void (async () => {
      try {
        await handler(req, res)
      } catch (err) {
        if (!started) rejectResponse(err)
        else stream.destroy()
      }
    })()

    return response
  }
}

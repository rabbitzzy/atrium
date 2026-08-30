/**
 * The kiosk's whole API, as one Serverless Function.
 *
 * Vercel makes a function per file under `api/`, and the Hobby plan allows
 * twelve per deployment. The kiosk had sixteen routes, so every deploy was
 * refused — after a clean build, at the step that uploads the output. The
 * routes are all small proxies and short database reads, so sixteen functions
 * was never buying anything except sixteen cold starts.
 *
 * So they live in `_routes/` now — the leading underscore is what keeps Vercel
 * from treating them as functions — and this file dispatches to them.
 *
 * ── Why the handlers are called directly ──
 *
 * Vercel invokes this function with Node's `(req, res)`, which is exactly what
 * every handler already takes. An earlier version of this file put a Hono app
 * in the middle and converted each request into a `Request` and each `Response`
 * back again. It worked locally and hung in production on every POST, for a
 * reason worth recording: Vercel's runtime reads the request body before the
 * handler is called, so a `Request` built from that stream has a body that
 * never arrives, and awaiting it waits until the function times out. GETs were
 * fine, which is precisely why the first round of production checks missed it.
 *
 * Handing the handlers the real pair removes that translation and everything
 * that depended on it: `req.body` is already parsed, `capture`'s SSE writes to
 * the real socket, and `capture-file` can pipe a read stream straight into the
 * response. Routing is an object lookup, which is all it ever needed to be.
 *
 * skill-graph and worksheet-print are the exceptions. Both are Hono apps, so
 * they do want a `Request` — built here from the body Vercel already parsed,
 * never from the spent stream. Mounting them is also what keeps them from
 * needing a machine of their own: neither runs anywhere but inside this
 * function now.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

import skillGraph from './_routes/skill-graph.js'
import worksheet from './_routes/worksheet.js'
import capture from './_routes/capture.js'
import captureFile from './_routes/capture-file.js'
import captureResolve from './_routes/capture-resolve.js'
import captures from './_routes/captures.js'
import floorPlan from './_routes/floor-plan.js'
import leafGrant from './_routes/leaf-grant.js'
import leaves from './_routes/leaves.js'
import myWork from './_routes/my-work.js'
import placement from './_routes/placement.js'
import printOutcome from './_routes/print-outcome.js'
import simulateSubmit from './_routes/simulate-submit.js'
import simulated from './_routes/simulated.js'
import studentState from './_routes/student-state.js'
import students from './_routes/students.js'
import teacherQueue from './_routes/teacher-queue.js'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown

/** The paths that existed before this file did. Packaging changed; the API did not. */
const ROUTES: Record<string, Handler> = {
  '/api/capture': capture,
  '/api/capture-file': captureFile,
  '/api/capture-resolve': captureResolve,
  '/api/captures': captures,
  '/api/floor-plan': floorPlan,
  '/api/leaf-grant': leafGrant,
  '/api/leaves': leaves,
  '/api/my-work': myWork,
  '/api/placement': placement,
  '/api/print-outcome': printOutcome,
  '/api/simulate-submit': simulateSubmit,
  '/api/simulated': simulated,
  '/api/student-state': studentState,
  '/api/students': students,
  '/api/teacher-queue': teacherQueue,
}

/** The Hono services mounted alongside the handlers, by the prefix they answer on. */
const MOUNTED: Array<[string, { fetch: (req: Request) => Response | Promise<Response> }]> = [
  ['/api/skill-graph', skillGraph],
  ['/api/worksheet', worksheet],
]

/**
 * Hand a request to a mounted Hono app and write back what it says.
 *
 * The body comes from `req.body` — already parsed by the runtime — rather than
 * from the request stream, which by this point has nothing left to give.
 */
async function serveMounted(
  app: { fetch: (req: Request) => Response | Promise<Response> },
  prefix: string,
  req: VercelRequest,
  res: VercelResponse,
  url: URL,
) {
  const path = url.pathname.slice(prefix.length) || '/'

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    // Re-serialising the body makes the inherited length wrong, and the host
    // belongs to the deployment rather than to this internal request.
    if (key === 'content-length' || key === 'host') continue
    headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }

  const init: RequestInit = { method: req.method ?? 'GET', headers }
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined) {
    if (typeof req.body === 'string') {
      init.body = req.body
    } else {
      init.body = JSON.stringify(req.body)
      if (!headers.has('content-type')) headers.set('content-type', 'application/json')
    }
  }

  const answer = await app.fetch(new Request(`http://mounted${path}${url.search}`, init))

  res.statusCode = answer.status
  answer.headers.forEach((value, key) => res.setHeader(key, value))
  if (!answer.body) return res.end()

  // Streamed rather than buffered, so a large Blueprint starts arriving while
  // the rest is still being serialised.
  for await (const chunk of answer.body as unknown as AsyncIterable<Uint8Array>) {
    res.write(chunk)
  }
  return res.end()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? '/', 'http://kiosk')
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname

  const route = ROUTES[path]
  if (route) return route(req, res)

  for (const [prefix, app] of MOUNTED) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return serveMounted(app, prefix, req, res, url)
    }
  }

  return res.status(404).json({ error: 'not_found', path })
}

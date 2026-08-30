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
 * from treating them as functions — and this file is the only entry point.
 * Each handler keeps its own file, its own name and its own
 * `(req, res)` shape; `_lib/vercel-handler.ts` is the seam that runs one inside
 * Hono, streaming included, which is what `capture` (SSE) and `capture-file`
 * (a piped read stream) need.
 *
 * The paths below are the paths that existed before. This is a change of
 * packaging, not of API: the kiosk calls `/api/leaves` exactly as it did.
 *
 * skill-graph is mounted rather than adapted, being a Hono app already. That
 * also means `student-state.ts`'s three calls to `/api/skill-graph` no longer
 * leave the datacentre — same process, same request, no round trip.
 */

import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import { fromVercel } from './_lib/vercel-handler'

import skillGraph from './_routes/skill-graph'
import capture from './_routes/capture'
import captureFile from './_routes/capture-file'
import captureResolve from './_routes/capture-resolve'
import captures from './_routes/captures'
import floorPlan from './_routes/floor-plan'
import leafGrant from './_routes/leaf-grant'
import leaves from './_routes/leaves'
import myWork from './_routes/my-work'
import placement from './_routes/placement'
import printOutcome from './_routes/print-outcome'
import simulateSubmit from './_routes/simulate-submit'
import simulated from './_routes/simulated'
import studentState from './_routes/student-state'
import students from './_routes/students'
import teacherQueue from './_routes/teacher-queue'

const app = new Hono()

/*
 * `all`, not `get`/`post`: the handlers check `req.method` themselves and
 * answer 405 with an `Allow` header. Routing by method here would turn those
 * into a 404, which says something different and less useful.
 */
const routes: Array<[string, Parameters<typeof fromVercel>[0]]> = [
  ['/api/capture', capture],
  ['/api/capture-file', captureFile],
  ['/api/capture-resolve', captureResolve],
  ['/api/captures', captures],
  ['/api/floor-plan', floorPlan],
  ['/api/leaf-grant', leafGrant],
  ['/api/leaves', leaves],
  ['/api/my-work', myWork],
  ['/api/placement', placement],
  ['/api/print-outcome', printOutcome],
  ['/api/simulate-submit', simulateSubmit],
  ['/api/simulated', simulated],
  ['/api/student-state', studentState],
  ['/api/students', students],
  ['/api/teacher-queue', teacherQueue],
]

for (const [path, handler] of routes) {
  const run = fromVercel(handler)
  app.all(path, (c) => run(c.req.raw))
}

app.route('/api/skill-graph', skillGraph)

export default handle(app)

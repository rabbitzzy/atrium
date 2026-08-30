/**
 * The service, without a listener.
 *
 * Split from index.ts so the same Hono app can be served two ways: as its own
 * process on a port (index.ts, for `pnpm dev` and for anyone running the
 * services separately), or mounted inside the kiosk's Vercel deployment
 * (packages/kiosk/api/skill-graph/[...route].ts). The routes, the error
 * handler and the middleware must not differ between those, which is the
 * whole reason they live here and not next to `serve()`.
 *
 * Nothing in here reads the environment at import time — `getSupabase()` is
 * lazy — so importing this module is safe before dotenv has run, which is
 * exactly the case on Vercel where there is no .env file to read.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import kcs from './routes/kcs.js'
import students from './routes/students.js'
import teacher from './routes/teacher.js'
import tasks from './routes/tasks.js'

const app = new Hono()

app.use('*', cors())
app.use('*', logger())

/**
 * Say what actually went wrong.
 *
 * Hono's default turns a thrown Error into a bare "Internal Server Error", so a
 * service running without credentials answers every route with five words that
 * name neither the cause nor the fix. That cost real debugging time once; the
 * message is the whole diagnosis and it belongs in the response.
 */
app.onError((err, c) => {
  console.error('[skill-graph]', err)
  return c.json({ error: err.message }, 500)
})

app.get('/health', (c) => c.json({ ok: true }))
app.route('/kcs', kcs)
app.route('/students', students)
app.route('/tasks', tasks)
app.route('/teacher', teacher)

export default app

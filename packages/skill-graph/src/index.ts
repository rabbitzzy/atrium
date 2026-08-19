import { config } from 'dotenv'
// Every service reads the repo-root .env, the way worksheet-print already did.
// Without this, `pnpm dev` starts a process that answers /health and 500s on
// every route that touches the database — which looks like a network fault
// from the outside and is not one.
config({ path: new URL('../../../.env', import.meta.url).pathname })

import { serve } from '@hono/node-server'
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

const PORT = Number(process.env['PORT'] ?? 3001)
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`skill-graph listening on :${PORT}`)
})

export default app

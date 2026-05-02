import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import students from './routes/students.js'
import tasks from './routes/tasks.js'

const app = new Hono()

app.use('*', cors())
app.use('*', logger())

app.get('/health', (c) => c.json({ ok: true }))
app.route('/students', students)
app.route('/tasks', tasks)

const PORT = Number(process.env['PORT'] ?? 3001)
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`skill-graph listening on :${PORT}`)
})

export default app

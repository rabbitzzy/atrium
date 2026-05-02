import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { generateCard } from './generator.js'

const app = new Hono()
app.use('*', cors())
app.use('*', logger())

app.get('/health', (c) => c.json({ ok: true }))

const GenerateSchema = z.object({
  studentId: z.string(),
  taskId:    z.string().uuid(),
  kcIds:     z.array(z.string()).min(1),
  difficulty: z.number().min(1).max(5).default(3),
})

// POST /generate  — produce a print-ready PDF Card
app.post('/generate', zValidator('json', GenerateSchema), async (c) => {
  const body = c.req.valid('json')
  const pdfBuffer = await generateCard(body)
  c.header('Content-Type', 'application/pdf')
  c.header('Content-Disposition', `attachment; filename="card-${body.taskId}.pdf"`)
  return c.body(pdfBuffer)
})

const PORT = Number(process.env['PORT'] ?? 3002)
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`worksheet listening on :${PORT}`)
})

export default app

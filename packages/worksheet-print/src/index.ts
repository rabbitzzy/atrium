import { config } from 'dotenv'
config({ path: new URL('../../../.env', import.meta.url).pathname })

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import puppeteer from 'puppeteer'
import { generateCard, renderV0Html, renderV0FilledHtml } from './generator.js'

const app = new Hono()
app.use('*', cors())
app.use('*', logger())

app.get('/health', (c) => c.json({ ok: true }))

// GET /print/v0  — serve the hardcoded v0 worksheet as printable HTML
app.get('/print/v0', async (c) => {
  const html = await renderV0Html()
  return c.html(html)
})

// GET /print/v0/filled  — worksheet with correct answers pre-filled (for scan testing)
app.get('/print/v0/filled', async (c) => {
  const html = await renderV0FilledHtml()
  return c.html(html)
})

// GET /pdf/v0/filled  — PDF with answers pre-filled, ready to download
app.get('/pdf/v0/filled', async (c) => {
  const html = await renderV0FilledHtml()
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle0' })
  const pdf = await page.pdf({ format: 'Letter', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
  await browser.close()
  c.header('Content-Type', 'application/pdf')
  c.header('Content-Disposition', 'attachment; filename="test-card-filled.pdf"')
  return c.body(new Uint8Array(pdf))
})

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
  return c.body(new Uint8Array(pdfBuffer))
})

const PORT = Number(process.env['PORT'] ?? 3002)
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`worksheet listening on :${PORT}`)
})

export default app

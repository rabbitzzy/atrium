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
import { BlueprintError, fetchLanding, InsufficientLeavesError, readLeafBalance } from './blueprint.js'
import { ProblemGenerationError } from './problems.js'
import { answerRegions, fiducialRegions, LAYOUTS, layoutFor, PAGE_H, PAGE_W } from './template.js'

const app = new Hono()

/**
 * Let a page served over HTTPS ask this service for a Card.
 *
 * Generating needs Chromium, and the Card it produces has one destination: the
 * printer on this machine. So this service stays beside the printer rather than
 * moving to Vercel, and the kiosk UI — which is served from a public origin —
 * calls it here on the LAN. Chrome guards that public-to-private crossing with
 * an extra preflight and refuses unless the answer allows it. Registered ahead
 * of `cors()` so it can add to the 204 that middleware returns.
 */
app.use('*', async (c, next) => {
  await next()
  if (c.req.raw.headers.get('access-control-request-private-network') === 'true') {
    c.res.headers.set('Access-Control-Allow-Private-Network', 'true')
  }
})

/*
 * The X-Atrium-* headers below are the whole answer to "what did this cost and
 * why this Room", and a cross-origin caller cannot read a response header
 * unless it is exposed. Without this the kiosk reads null for the Leaf balance
 * and shows a child nothing about the Leaf they just spent.
 */
app.use('*', cors({ origin: '*', exposeHeaders: ['X-Atrium-Rooms', 'X-Atrium-Leaves', 'X-Atrium-Reason'] }))
app.use('*', logger())

app.get('/health', (c) => c.json({ ok: true }))

/**
 * GET /template/regions — where the answers are, on every Card ever printed.
 *
 * Static, and that is the entire point of BHCS-36. Because the layout is fixed,
 * this answer does not depend on which Card you are holding, which student it
 * belongs to, or what the questions say. The evaluator does not have to find
 * the answer boxes in a photograph; it corrects the image against the four
 * corner marks and then crops by multiplication.
 *
 * Fractions of the page rather than pixels or millimetres, so a capture at any
 * resolution uses the same numbers.
 */
app.get('/template/regions', (c) => {
  // `?grade=` gives one band's map; without it, all three, because there is no
  // longer a single answer. What has not changed is the guarantee that made
  // this endpoint worth having: the regions are computed from constants and are
  // knowable before any page is rendered. A scanned Card is matched against the
  // map stored on its own task, which is why generation writes it there.
  const grade = Number(c.req.query('grade'))
  if (Number.isFinite(grade) && grade >= 1 && grade <= 5) {
    const layout = layoutFor(grade)
    return c.json({
      page: { widthMm: PAGE_W, heightMm: PAGE_H },
      grade,
      layout,
      answers: answerRegions(layout.slots, grade),
      fiducials: fiducialRegions(),
    })
  }

  return c.json({
    page: { widthMm: PAGE_W, heightMm: PAGE_H },
    fiducials: fiducialRegions(),
    bands: Object.fromEntries(
      Object.entries(LAYOUTS).map(([name, layout]) => {
        const grade = name === 'early' ? 1 : name === 'middle' ? 3 : 5
        return [name, { layout, answers: answerRegions(layout.slots, grade) }]
      }),
    ),
  })
})

const GenerateSchema = z.object({
  studentId: z.string(),
  taskId: z.string().uuid(),
  /**
   * Which Rooms this Card is for. Omit it and the planner decides — which is
   * the intended path, since the whole point of BHCS-30 is that the system
   * knows what a student should work on next.
   */
  kcIds: z.array(z.string()).min(1).optional(),
  difficulty: z.number().min(1).max(5).optional(),
  /** Point the Visit at one subject (BHCS-91). */
  subject: z.enum(['math', 'lang/en', 'lang/zh']).optional(),
  /** Simulate mode: return the Card as HTML for a screen, not a PDF for a tray. */
  preview: z.boolean().optional(),
})

/**
 * POST /generate — a print-ready Card for a student's Landing.
 *
 * Every failure below returns before anything is spent. That ordering is the
 * ticket: a Card costs a Leaf and a sheet of paper, and the previous version
 * would answer a failed generation with a header, a QR code and no questions —
 * a page the child cannot work and therefore cannot submit, which means they
 * cannot earn the Leaf back either.
 */
app.post('/generate', zValidator('json', GenerateSchema), async (c) => {
  const body = c.req.valid('json')

  try {
    /*
     * Checked before the model is called, and checked again by the spend at
     * the end. This one is for the child: a student at zero should be told in
     * a second rather than after twenty seconds of generating a Card they
     * cannot have. The spend is the one that is authoritative.
     */
    const balance = await readLeafBalance(body.studentId)
    if (balance < 1) {
      return c.json({ error: 'insufficient_leaves', balance, studentId: body.studentId }, 402)
    }

    let kcIds = body.kcIds
    let reason: { en: string; zh: string } | undefined

    if (!kcIds) {
      const landing = await fetchLanding(body.studentId, body.subject)
      // The planner declining to name a Room is a real answer, not an error to
      // route around. Printing something arbitrary because it said "ask a
      // teacher" is exactly the paper the Leaf economy exists to prevent.
      if (!landing) {
        return c.json(
          {
            error: 'no_room_to_assign',
            detail: 'the planner has nothing to assign — everything is mastered, or a teacher needs to look first',
            studentId: body.studentId,
          },
          409,
        )
      }
      kcIds = [landing.targetKcId]
      reason = { en: landing.reasonEn, zh: landing.reasonZh }
    }

    const { pdf, html, balance: remaining } = await generateCard({
      studentId: body.studentId,
      taskId: body.taskId,
      kcIds,
      ...(body.difficulty !== undefined ? { difficulty: body.difficulty } : {}),
    }, body.preview === true)

    if (body.preview) {
      // The Card, its questions and what it cost — everything the simulate
      // screen needs to render a page and collect marks against it.
      return c.json({ taskId: body.taskId, rooms: kcIds, html, leavesLeft: remaining })
    }

    c.header('Content-Type', 'application/pdf')
    c.header('Content-Disposition', `attachment; filename="card-${body.taskId}.pdf"`)
    // Why this Card, on the response rather than in the PDF: the kiosk shows it
    // to the child and the teacher view logs it, and neither needs it printed.
    c.header('X-Atrium-Rooms', kcIds.join(','))
    c.header('X-Atrium-Leaves', String(remaining))
    if (reason) c.header('X-Atrium-Reason', encodeURIComponent(reason.en))
    return c.body(new Uint8Array(pdf))
  } catch (err) {
    if (err instanceof InsufficientLeavesError) {
      return c.json({ error: 'insufficient_leaves', balance: err.balance, studentId: body.studentId }, 402)
    }
    if (err instanceof ProblemGenerationError) {
      return c.json({ error: 'generation_failed', detail: err.message }, 502)
    }
    if (err instanceof BlueprintError) {
      return c.json({ error: 'blueprint_unavailable', detail: err.message }, 503)
    }
    throw err
  }
})

const PORT = Number(process.env['PORT'] ?? 3002)
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`worksheet listening on :${PORT}`)
})

export default app

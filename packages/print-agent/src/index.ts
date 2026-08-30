/**
 * The print agent (BHCS-67).
 *
 * Flywheel step 3 depends on paper physically coming out of a machine, and
 * nothing in the repo addressed how. `impl/kiosk.md` said the kiosk would
 * "trigger browser print dialog", and a browser print dialog is not something
 * to show a six-year-old: it has a printer picker, a page-range field, a copies
 * spinner and a cancel button, any of which turns a Leaf into nothing.
 *
 * ── Why this is a separate deployable ──
 *
 * The constraint that decides the architecture is where things sit. The
 * printer is on the school LAN. The kiosk browser is on the school LAN. What
 * generates the PDF is a serverless function, which is not — and cannot reach
 * a printer at 192.168.x.y whatever it is told.
 *
 * So "CUPS straight from the server", the tidiest of the three options in the
 * ticket, is not available: there is no route from the server to the tray. The
 * job has to be handed over by something already on the LAN, and this is the
 * smallest thing that can be.
 *
 * ── Why not managed ChromeOS printing ──
 *
 * The ticket's own first guess, and it does work: a printer provisioned by
 * policy with print preview disabled sends `window.print()` straight to paper,
 * and it needs no new service at all.
 *
 * It fails one test, and the ticket names that test itself — "choose the
 * printer with the failure modes in mind". `window.print()` returns undefined.
 * It returns undefined when the page prints, when the printer is out of paper,
 * when it is unplugged, and when the job is cancelled at the device. A station
 * built on it cannot ever know that a Leaf was spent for nothing, so BHCS-38's
 * refund path stays permanently unreachable and the only recovery is a teacher
 * noticing and granting a replacement.
 *
 * A CUPS queue can be asked. `lpstat` reports held, stopped, cancelled and
 * completed, and `lpstat -p` reports a disabled queue — out of paper, jammed,
 * offline. That turns the refund from dead code into something buildable, and
 * it is the whole reason to accept an extra process on the LAN.
 *
 * ── What the browser is left doing ──
 *
 * Nothing. It POSTs the PDF here and this hands it to CUPS. There is no dialog
 * to suppress because there is no dialog: the acceptance's "no dialog, no
 * picker, no way to print twenty copies" is satisfied by construction rather
 * than by configuration, and there is no policy to get wrong on a machine
 * nobody has logged into for a term.
 *
 * Copies are not a parameter. One Card, one Leaf, one sheet.
 */

import { config } from 'dotenv'
// Every service reads the repo-root .env, the way worksheet-print already did.
// Without this, `pnpm dev` starts a process that answers /health and 500s on
// every route that touches the database — which looks like a network fault
// from the outside and is not one.
config({ path: new URL('../../../.env', import.meta.url).pathname })

import { spawn } from 'node:child_process'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
  isFailure,
  jobState,
  lpArgs,
  parseJobId,
  parsePrinterReady,
  type JobState,
} from './cups.js'

const PRINTER = process.env['ATRIUM_PRINTER'] ?? ''
const PORT = Number(process.env['PORT'] ?? 3003)

function run(cmd: string, args: string[], stdin?: Buffer): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args)
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    p.on('close', (code) => resolve({ code: code ?? 1, out }))
    if (stdin) {
      p.stdin.write(stdin)
      p.stdin.end()
    }
  })
}

const app = new Hono()

/**
 * Let a page served over HTTPS talk to this agent on the loopback.
 *
 * The kiosk UI is no longer served from this machine — on Vercel it comes from
 * a public origin, and the browser rather than the server is what hands a Card
 * to the printer (see packages/kiosk/src/lib/printer.ts for why the connection
 * runs in that direction). That request crosses from a public origin to a
 * private address, and Chrome guards that crossing with an extra preflight: it
 * asks with `Access-Control-Request-Private-Network` and refuses unless the
 * answer comes back with the matching allow.
 *
 * Ordinary CORS is not enough on its own and neither is loopback's usual
 * exemption from mixed-content blocking. Without this header the print request
 * fails in the browser before it is ever sent, and the only visible symptom is
 * a Card that never prints.
 *
 * Registered ahead of `cors()` so it can add to the 204 that middleware
 * returns for a preflight.
 */
app.use('*', async (c, next) => {
  await next()
  if (c.req.raw.headers.get('access-control-request-private-network') === 'true') {
    c.res.headers.set('Access-Control-Allow-Private-Network', 'true')
  }
})

app.use('*', cors())

app.get('/health', async (c) => {
  const { out } = await run('lpstat', ['-p'])
  const ready = PRINTER ? parsePrinterReady(out, PRINTER) : false
  return c.json({ ok: true, printer: PRINTER || null, ready })
})

/**
 * POST /print — a PDF in, a job id out.
 *
 * The readiness check happens here, before the caller commits, because the
 * cheapest failure is the one that lands before the child is charged a Leaf.
 */
app.post('/print', async (c) => {
  if (!PRINTER) return c.json({ error: 'no_printer_configured' }, 503)

  const { out: status } = await run('lpstat', ['-p'])
  if (!parsePrinterReady(status, PRINTER)) {
    return c.json({ error: 'printer_not_ready', detail: status.trim().split('\n')[0] ?? '' }, 503)
  }

  const pdf = Buffer.from(await c.req.arrayBuffer())
  if (!pdf.length) return c.json({ error: 'empty_document' }, 400)

  const title = c.req.query('title') ?? 'Atrium Card'
  const hold = c.req.query('hold') === '1'
  const { code, out } = await run('lp', lpArgs({ printer: PRINTER, title, hold }), pdf)
  const jobId = parseJobId(out)
  if (code !== 0 || !jobId) return c.json({ error: 'submit_failed', detail: out.trim() }, 502)

  return c.json({ jobId, held: hold })
})

/**
 * GET /job/:id — how did it go?
 *
 * The endpoint that makes BHCS-38's refund path real. Nothing calls it yet;
 * what it needs is a caller that waits, and that is a decision about how long
 * a child should stand at a printer, which belongs with the station build.
 */
app.get('/job/:id{.+}', async (c) => {
  const id = c.req.param('id')
  const [active, done, printers] = await Promise.all([
    run('lpstat', ['-W', 'not-completed', '-o']),
    run('lpstat', ['-W', 'completed', '-o']),
    run('lpstat', ['-p']),
  ])
  const state: JobState = jobState(
    {
      notCompleted: active.out,
      completed: done.out,
      printerReady: parsePrinterReady(printers.out, PRINTER),
    },
    id,
  )
  return c.json({ jobId: id, state, failed: isFailure(state) })
})

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`print-agent listening on :${PORT} → ${PRINTER || 'NO PRINTER CONFIGURED'}`)
})

export default app

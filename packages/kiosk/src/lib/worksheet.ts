/**
 * Asking for a Card, from the browser.
 *
 * ── Why this service stays on the LAN ──
 *
 * Generating a Card renders HTML through headless Chromium. That does not fit
 * a serverless function well — the browser binary dwarfs the deploy limit — and
 * more to the point it would be pointless: the PDF's only destination is the
 * printer on this machine, so rendering it in a datacentre means shipping it
 * back down again for nothing.
 *
 * So worksheet-print stays beside the print agent, and the same reasoning that
 * moved printing into the browser (`printer.ts`) applies here. A deployed API
 * route cannot reach a LAN address; this page can, because it runs on the
 * machine that address belongs to.
 *
 * What this is *not* is offline capability. Generating still calls skill-graph
 * for the Room, the task record and the Leaf spend, and skill-graph is deployed
 * and backed by a hosted database. No arrangement makes Cards work without
 * internet — this one just stops the PDF making a pointless round trip.
 *
 * ── What it costs ──
 *
 * `generateCard` spends a Leaf, and there is no refund path. Callers must have
 * checked the tray first (`printer.ts`), and must report what became of the
 * Card afterwards, because past this point a failure is not free.
 */

/** Where this station's worksheet service listens. Loopback unless told otherwise. */
export function worksheetUrl(): string {
  try {
    return localStorage.getItem('atrium.worksheet') || 'http://127.0.0.1:3002'
  } catch {
    return 'http://127.0.0.1:3002'
  }
}

/** A Card on paper: the bytes, and what the kiosk needs to talk about them. */
export interface GeneratedCard {
  taskId: string
  pdf: Blob
  rooms: string[]
  leavesLeft: number
}

/** A rehearsal: the same Card as markup, no paper, and the Leaf still spent. */
export interface PreviewCard {
  taskId: string
  html: string
  rooms: string[]
  leavesLeft: number
}

/** The child has none left. Not an error, and never rendered as a refusal. */
export class InsufficientLeaves extends Error {
  constructor(readonly balance: number) {
    super(`no Leaves to spend (balance ${balance})`)
  }
}

/**
 * The planner declined to name a Room.
 *
 * A real answer rather than a fault: everything is mastered, or a teacher needs
 * to place them first. Printing something arbitrary here is exactly the paper
 * the Leaf economy exists to prevent.
 */
export class NoRoomToAssign extends Error {}

/** Reached and refused for some other reason — generation failed, upstream down. */
export class WorksheetRefused extends Error {}
/** Not reached at all. A different problem, for a different person to fix. */
export class WorksheetUnreachable extends Error {}

async function post(body: unknown): Promise<Response> {
  try {
    return await fetch(`${worksheetUrl()}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new WorksheetUnreachable(`no worksheet service at ${worksheetUrl()}`)
  }
}

/** Turn a non-OK response into the error that says what actually happened. */
async function refuse(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { balance?: number; detail?: string }
  if (res.status === 402) throw new InsufficientLeaves(body.balance ?? 0)
  if (res.status === 409) throw new NoRoomToAssign(body.detail ?? '')
  throw new WorksheetRefused(body.detail ?? `worksheet service answered ${res.status}`)
}

/**
 * Make a Card. Spends a Leaf, and returns the PDF to hand to the printer.
 *
 * The counts ride in headers because the body is the PDF itself. They are
 * readable cross-origin only because the service exposes them explicitly.
 */
export async function generateCard(args: {
  studentId: string
  taskId: string
  subject?: string
}): Promise<GeneratedCard> {
  const res = await post({
    studentId: args.studentId,
    taskId: args.taskId,
    ...(args.subject ? { subject: args.subject } : {}),
  })
  if (!res.ok) return refuse(res)

  return {
    taskId: args.taskId,
    pdf: await res.blob(),
    rooms: (res.headers.get('x-atrium-rooms') ?? '').split(',').filter(Boolean),
    leavesLeft: Number(res.headers.get('x-atrium-leaves') ?? '0'),
  }
}

/**
 * Rehearse a Card on screen. Uses no paper and still spends the Leaf, because
 * the point of a rehearsal is to exercise the economy rather than sidestep it.
 */
export async function previewCard(args: {
  studentId: string
  taskId: string
  subject?: string
}): Promise<PreviewCard> {
  const res = await post({
    studentId: args.studentId,
    taskId: args.taskId,
    preview: true,
    ...(args.subject ? { subject: args.subject } : {}),
  })
  if (!res.ok) return refuse(res)

  const body = (await res.json()) as { taskId: string; html: string; rooms: string[]; leavesLeft: number }
  return {
    taskId: body.taskId,
    html: body.html,
    rooms: body.rooms ?? [],
    leavesLeft: body.leavesLeft ?? 0,
  }
}

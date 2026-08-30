/**
 * Asking for a Card, from the browser.
 *
 * ── Same origin, because nothing runs on this machine any more ──
 *
 * This used to be a service on the kiosk machine: making a Card meant launching
 * headless Chromium, and the paper came out of a printer on that LAN. The Card
 * is HTML now and the browser prints it, so the service went into the
 * deployment with everything else and answers at /api/worksheet.
 *
 * What this is *not* is offline capability. Generating still calls skill-graph
 * for the Room, the task record and the Leaf spend, and that is a hosted
 * database. No arrangement makes Cards work without internet.
 *
 * ── What it costs ──
 *
 * `generateCard` spends a Leaf, and there is no refund path. Nothing checks the
 * tray first any more — a browser cannot ask a printer whether it has paper —
 * so callers must report what became of the Card, because past this point a
 * failure is not free.
 */

const WORKSHEET = '/api/worksheet'

/**
 * A Card: the markup, and what the kiosk needs to talk about it.
 *
 * One shape for both uses. A Card that gets printed and a Card rehearsed on
 * screen are the same document now — the browser either prints the markup or
 * renders it — so there is no longer a preview type distinct from a real one.
 */
export interface GeneratedCard {
  taskId: string
  html: string
  rooms: string[]
  leavesLeft: number
  /**
   * How many questions are on the page — five, seven or nine, from the grade
   * band's layout. Carried rather than assumed: the simulate screen used to
   * hardcode five, so a middle-band Card's last two questions had no way to be
   * marked and were silently dropped from the attempt.
   */
  questions: number
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
    return await fetch(`${WORKSHEET}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new WorksheetUnreachable('the station could not reach the worksheet service')
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
 * Make a Card. Spends a Leaf, and returns the markup to print or to show.
 *
 * Simulate mode asks for exactly the same thing: a rehearsal that skipped
 * generation would be rehearsing a different system, and it costs the same Leaf
 * on purpose. What differs is only what the caller then does with the markup.
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

  const body = (await res.json()) as {
    taskId: string
    html: string
    rooms?: string[]
    leavesLeft?: number
    questions?: number
  }
  return {
    taskId: body.taskId ?? args.taskId,
    html: body.html,
    rooms: body.rooms ?? [],
    leavesLeft: body.leavesLeft ?? 0,
    // Fall back to counting the answer boxes rather than to a guess: a wrong
    // count here means questions a child cannot mark.
    questions: body.questions ?? (body.html.match(/class="answer"/g) ?? []).length,
  }
}

/**
 * Talking to CUPS, and reading back what it says (BHCS-67).
 *
 * Pure string work: builds the arguments for `lp` and parses `lpstat`. The
 * process spawning lives in `index.ts`, so the part that decides what to ask
 * for and what the answer meant can be tested without a printer attached.
 */

export interface PrintOptions {
  /** CUPS queue name, e.g. `HP_ENVY_5000_series__A84B0E_`. */
  printer: string
  /** Shown in the queue, so a jam can be traced to a Card. */
  title: string
  /**
   * Cards are always single-sided. `eco-design.md` calls the back scratch
   * space, and ink on it bleeds through into the scan of the front — which is
   * the side the evaluator has to read.
   */
  sides?: 'one-sided'
  /**
   * Held jobs are how this is tested without spending paper, and how a caller
   * can stage a print it has not committed to yet.
   */
  hold?: boolean
}

export function lpArgs(opts: PrintOptions): string[] {
  const args = ['-d', opts.printer, '-t', opts.title, '-n', '1']
  // Never more than one copy. A child cannot ask for twenty, and neither can a
  // retry loop: the count is not a parameter this agent accepts.
  args.push('-o', `sides=${opts.sides ?? 'one-sided'}`)
  args.push('-o', 'media=Letter')
  args.push('-o', 'fit-to-page')
  if (opts.hold) args.push('-H', 'hold')
  return args
}

/** `request id is HP_ENVY-59 (1 file(s))` — the only line `lp` prints. */
export function parseJobId(stdout: string): string | null {
  const m = /request id is (\S+)/.exec(stdout)
  return m?.[1] ?? null
}

/**
 * What CUPS will actually tell you about a job.
 *
 * The first draft of this parsed a state word out of `lpstat -o`. There is no
 * state word in `lpstat -o` — the short form prints id, user, size and date and
 * nothing else, and the fixtures that said otherwise were invented. Running it
 * against a real queue is what produced this list, which is smaller and true:
 *
 *   `lpstat -W not-completed -o`  jobs still in the queue
 *   `lpstat -W completed -o`      jobs that have left it
 *   `lpstat -p`                   whether the queue can take work at all
 *
 * The honest consequence, worth stating rather than papering over: a job
 * **cancelled at the device** lands in `completed` beside one that printed
 * perfectly, and these three commands cannot separate them. What they can
 * separate is the case the Leaf refund actually exists for — a job sitting in
 * the queue while the printer is disabled, which is out of paper, jammed or
 * offline. That is detectable, and it is the difference between a refund path
 * that can fire and one that cannot.
 */
export type JobState =
  /** Queued, held or printing — still on its way. */
  | 'active'
  /** In the queue, but the queue cannot print. Out of paper, jammed, offline. */
  | 'stuck'
  /** Left the queue. Printed, or cancelled at the device; indistinguishable. */
  | 'finished'
  | 'unknown'

export interface QueueSnapshot {
  /** `lpstat -W not-completed -o` */
  notCompleted: string
  /** `lpstat -W completed -o` */
  completed: string
  /** Whether `lpstat -p` says the queue can take work. */
  printerReady: boolean
}

const listed = (output: string, jobId: string) =>
  output.split('\n').some((l) => l.trim().startsWith(jobId))

export function jobState(snap: QueueSnapshot, jobId: string): JobState {
  if (listed(snap.notCompleted, jobId)) {
    return snap.printerReady ? 'active' : 'stuck'
  }
  if (listed(snap.completed, jobId)) return 'finished'
  // CUPS ages completed jobs out of its history. Absent from both lists means
  // old, not lost — and treating it as finished is the safe direction, because
  // refunding a Card that printed hands out free paper and teaches the child
  // that the loop is optional.
  return 'finished'
}

/**
 * Whether this state means the Leaf was spent for nothing.
 *
 * Only `stuck`. A job still moving has not failed, and a finished one cannot be
 * shown to have failed — see the note on cancellation above.
 */
export function isFailure(state: JobState): boolean {
  return state === 'stuck'
}

/**
 * Is the printer able to take a job at all?
 *
 * `lpstat -p` says `idle`, `printing`, or `disabled`, and a disabled queue is
 * the out-of-paper / offline case the Leaf refund exists for. Checked before a
 * Leaf is spent rather than after, because the cheapest failure is the one that
 * happens before the child is charged.
 */
export function parsePrinterReady(lpstatOutput: string, printer: string): boolean {
  const line = lpstatOutput.split('\n').find((l) => l.includes(printer))
  if (!line) return false
  const l = line.toLowerCase()
  if (l.includes('disabled')) return false
  return l.includes('is idle') || l.includes('now printing') || l.includes('is printing')
}

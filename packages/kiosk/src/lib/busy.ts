/**
 * "The station is doing something the child is waiting for."
 *
 * The idle timer (`presence.ts`) reads silence as absence, and for the case it
 * was written for — a child who took their paper and walked away — that is
 * right. It is exactly wrong for the other kind of silence: a child standing at
 * the station watching it write a worksheet. They are not touching anything
 * because there is nothing to touch, and being asked "still here?" mid-wait is
 * the station accusing them of leaving while they wait for it.
 *
 * Generating a Card is twenty to thirty seconds. Grading a scan is comparable.
 * Neither reaches four minutes on a good day — but a Gemini call that stalls, a
 * printer that is thinking, a queue behind another child's job, all of them
 * turn a wait into a long wait, and the moment the wait crosses the threshold
 * the station gives the visit away while the work is still in flight.
 *
 * So waiting is declared, not inferred. While anything is marked busy the idle
 * clock does not run at all, and it starts from zero when the work finishes —
 * which is the honest reading, because the first thing a child does with a
 * finished Card is read it.
 *
 * ── Why a module and not a context ──
 *
 * `StillHere` mounts beside `Capture` in `App`, and the work is started four
 * components deep inside it. Threading a provider through everything between
 * them would put "is the station busy" in the props of screens that have no
 * opinion about it.
 *
 * There is no subscription and no hook, because the only reader already runs on
 * a one-second interval and asks. Nothing needs to re-render the moment a wait
 * starts — the wait has its own screen.
 *
 * A counter rather than a boolean because two things can be in flight at once —
 * a scan uploading while a Card generates — and whichever finishes first must
 * not clear the other one's wait.
 */

let depth = 0

/**
 * Mark the station busy. Returns the release, which is safe to call twice —
 * a `finally` that runs after an early `return` should not be able to drive the
 * count below zero and leave the next wait unprotected.
 */
export function beginBusy(): () => void {
  depth += 1

  let released = false
  return () => {
    if (released) return
    released = true
    depth = Math.max(0, depth - 1)
  }
}

export function isBusy(): boolean {
  return depth > 0
}

/** Test seam. Nothing in the app calls this. */
export function resetBusy(): void {
  depth = 0
}

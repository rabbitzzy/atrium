/**
 * How long a checked-in student stays checked in when nobody touches anything
 * (BHCS-18).
 *
 * Children do not check out. They finish, they take their paper, and they walk
 * away with their name still on the screen — which means the next child to sit
 * down inherits a session, and the first thing they put under the camera is
 * filed under someone else. There is no server session to expire and no badge
 * to remove, so the station has to notice on its own that the person it is
 * talking to has gone.
 *
 * Two numbers, and the gap between them is the whole design:
 *
 * **Ask, then leave.** Four minutes of no input is a strong hint that nobody is
 * there, but it is only a hint — a slow reader working through a ten-question
 * Debrief is also perfectly still. So the four-minute mark asks rather than
 * acts, and the answer is one large button. Only the 45 seconds after the
 * question go unanswered does the station return to the welcome screen.
 *
 * Nothing is lost when it does: every capture and every Debrief is permanent
 * and reachable from My Work the moment the student checks in again. What is
 * gained is that an abandoned station is never more than about five minutes
 * from being clean, so the ordinary experience of the next child is that there
 * is no session to inherit at all.
 */

/** No input for this long and the station asks whether anyone is still there. */
export const IDLE_ASK_MS = 4 * 60_000

/** How long the question stays up, unanswered, before the visit ends. */
export const IDLE_GRACE_MS = 45_000

export type Presence =
  /** Someone is using the station, or was recently enough to assume so. */
  | { state: 'here' }
  /** The "Still here?" card is up, counting down. */
  | { state: 'asking'; secondsLeft: number }
  /** Nobody answered. Back to the welcome screen. */
  | { state: 'gone' }

/**
 * What to believe about the person in front of the station, given how long it
 * has been since they last touched it.
 *
 * `secondsLeft` is rounded up so the card can show a whole number that reaches
 * "1" before it disappears rather than sitting on "0" for a second.
 */
export function presenceAfter(idleMs: number): Presence {
  if (idleMs < IDLE_ASK_MS) return { state: 'here' }
  if (idleMs >= IDLE_ASK_MS + IDLE_GRACE_MS) return { state: 'gone' }
  return { state: 'asking', secondsLeft: Math.ceil((IDLE_ASK_MS + IDLE_GRACE_MS - idleMs) / 1000) }
}

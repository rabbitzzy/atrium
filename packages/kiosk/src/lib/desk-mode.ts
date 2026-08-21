/**
 * Which half of the station the screen is showing, and who decides.
 *
 * The station does two things — hand out paper, take paper back — and never
 * both at once. What it shows follows the desk: a page under the camera means
 * scan, an empty desk means get.
 *
 * Except when the child has just said otherwise, and that exception is the
 * whole reason this is a file rather than three lines in a component. It has
 * been wrong twice, in mirror image:
 *
 *   Pressing "Get worksheet" with the page still lying there flipped to the
 *   doors, then detection saw the same page a second later and flipped back.
 *   Pressing "I want to show you" with an empty desk did the same in reverse.
 *
 * Both read, from the front, as a button that does not work — which is worse
 * than either mode being wrong, because a child stops trusting the control
 * rather than the state.
 *
 * So: **the station never argues with a button that was just pressed.** A
 * choice is pinned, and the pin is released by the desk agreeing rather than by
 * a timer. Take the page away and the doors stop being a held choice and start
 * being the obvious one; that is the moment automatic behaviour can have the
 * wheel back, and it needs no clock.
 */

export type DeskMode = 'get' | 'scan'

export interface DeskState {
  mode: DeskMode
  /** The mode the child asked for, still held because the desk disagrees. */
  pinned: DeskMode | null
}

/** What the desk itself is saying, with no opinion about what was asked for. */
export function deskSays(sawPage: boolean): DeskMode {
  return sawPage ? 'scan' : 'get'
}

/**
 * Advance the mode for what the camera can currently see.
 *
 * Pure and total. `sawPage` is already debounced by the caller — arriving is
 * confirmed faster than leaving, because a page appearing is a clear signal and
 * a page lifted to be turned over is not.
 */
export function nextDeskState(state: DeskState, sawPage: boolean): DeskState {
  const desk = deskSays(sawPage)

  if (state.pinned) {
    // The desk caught up. The choice has stopped being an override.
    if (state.pinned === desk) return { mode: state.mode, pinned: null }
    return state
  }

  return state.mode === desk ? state : { mode: desk, pinned: null }
}

/** The child pressed one of the two flip buttons. */
export function chooseDeskMode(mode: DeskMode): DeskState {
  return { mode, pinned: mode }
}

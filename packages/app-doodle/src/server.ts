/**
 * Doodle — server half.
 *
 * Three lines, and that is the point. Doodles are stored, never interpreted:
 * machine-reading a child's drawing buys nothing here and invites judgments
 * nobody asked for. The absence of `extract` *is* the store-only pipeline —
 * there is no special case for it anywhere in the platform.
 */

import type { CaptureAppServer } from '@atrium/schema'

export const doodleServer: CaptureAppServer = {
  id: 'doodle',
}

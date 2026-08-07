/**
 * The server-side app registry.
 *
 * This is the only file in `api/` that names a capture kind. Everything else —
 * storage, the row, the Gemini transport, the dispatch in pipelines.ts — works
 * off `CaptureAppServer` and never learns what is on the paper.
 *
 * Adding an app is one import and one array entry.
 */

import type { CaptureAppServer } from '@atrium/schema'
import { worksheetServer } from './apps/worksheet'
import { chessServer } from './apps/chess'
import { doodleServer } from './apps/doodle'

export const APPS: readonly CaptureAppServer[] = [worksheetServer, chessServer, doodleServer]

/** Order is user-visible: it is the list in the "kind must be one of" error. */
export const APP_IDS: readonly string[] = APPS.map((a) => a.id)

export function appById(id: string): CaptureAppServer | undefined {
  return APPS.find((a) => a.id === id)
}

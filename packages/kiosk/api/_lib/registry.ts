/**
 * The server-side app registry.
 *
 * This is the only file in `api/` that names a capture kind. Everything else —
 * storage, the row, the Gemini transport, the dispatch in pipelines.ts — works
 * off `CaptureAppServer` and never learns what is on the paper.
 *
 * Imports the `/server` entry point of each app deliberately: it carries the
 * prompts and the post-processing and nothing that renders, so no React
 * reaches the capture function.
 *
 * Adding an app is one import and one array entry.
 */

import type { CaptureAppServer } from '@atrium/schema'
import { worksheetServer } from '@atrium/app-worksheet/server'
import { chessServer } from '@atrium/app-chess/server'
import { doodleServer } from '@atrium/app-doodle/server'

export const APPS: readonly CaptureAppServer[] = [worksheetServer, chessServer, doodleServer]

/** Order is user-visible: it is the list in the "kind must be one of" error. */
export const APP_IDS: readonly string[] = APPS.map((a) => a.id)

export function appById(id: string): CaptureAppServer | undefined {
  return APPS.find((a) => a.id === id)
}

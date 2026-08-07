/**
 * The kiosk-side app registry.
 *
 * This is the only file in `src/` that names a capture kind. The picker, the
 * crop guide, and the result screen all read off `CaptureApp`, so adding a
 * fourth kind is one import and one array entry here — and nothing else in the
 * platform changes.
 *
 * Order is user-visible: it is the order of the buttons in the picker, and the
 * first entry is what a student gets before they choose anything.
 */

import type { CaptureApp } from '@atrium/schema'
import { worksheetApp } from '../apps/worksheet'
import { chessApp } from '../apps/chess'
import { doodleApp } from '../apps/doodle'

/**
 * `any` on purpose: the registry is heterogeneous — each app narrows Result to
 * its own shape, and the platform only ever hands it back the `unknown` the
 * server returned. Narrowing here would mean the platform knowing the shapes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCaptureApp = CaptureApp<any>

export const APPS: readonly [AnyCaptureApp, ...AnyCaptureApp[]] = [worksheetApp, chessApp, doodleApp]

export function appById(id: string): AnyCaptureApp | undefined {
  return APPS.find((a) => a.id === id)
}

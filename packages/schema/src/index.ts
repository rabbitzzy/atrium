/**
 * @atrium/schema — the shapes every layer agrees on.
 *
 * A helper package in the sense of impl/architecture.md: pure, no I/O, no
 * network, no env vars. In fact this one is types only, so it contributes
 * nothing at all to any bundle — every import of it erases at compile time.
 *
 * It exists so that the platform (`@atrium/kiosk`) and the capture apps
 * (`@atrium/app-*`) can agree on a contract without either depending on the
 * other. The platform importing the apps is the intended direction; the apps
 * importing the platform back would be a cycle.
 */

export type { Student } from './student'
export type { PaperId } from './paper'
export type { GeminiSchema } from './gemini'
export type {
  OcrStatus,
  StorageBackend,
  CaptureResponse,
  CaptureStreamEvent,
  QualityTier,
} from './capture'
export type {
  CaptureApp,
  CaptureAppServer,
  CaptureContext,
  CaptureExtract,
  CaptureTheme,
  Partially,
  SystemPrompt,
  WaitLine,
} from './app'

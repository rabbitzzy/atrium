/**
 * Capture storage — pluggable backend.
 *
 * Captures are the one artifact we must never lose, so where the bytes land is
 * deliberately decoupled from everything else. Two backends today:
 *
 *   local  — a directory on disk. Dev, offline kiosks, and anywhere Drive auth
 *            is more trouble than it's worth.
 *   drive  — Google Drive. Production: durable, off-machine, and browsable by
 *            a teacher without any Atrium UI.
 *
 * Selected by CAPTURE_STORAGE. The rest of the pipeline only sees StoredFile,
 * so adding S3 or Supabase Storage later means writing one function here.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import type { StorageBackend } from '@atrium/schema'
import { uploadToDrive } from './drive'

export interface StoredFile {
  backend: StorageBackend
  /** Backend-specific handle: a Drive file id, or a path relative to the local root. */
  id: string
  /** Something a browser can open. */
  url: string
}

export interface StoreRequest {
  bytes: Buffer
  filename: string
  mimeType: string
  /** Subdirectory / Drive folder — one per capture kind. */
  folder: string
}

export function activeBackend(): StorageBackend {
  const configured = process.env['CAPTURE_STORAGE']?.trim().toLowerCase()
  if (configured === 'local' || configured === 'drive') return configured
  if (configured) throw new Error(`CAPTURE_STORAGE must be "local" or "drive", got "${configured}"`)
  // Defaulting to drive keeps production honest: a deploy that forgets to set
  // this fails loudly on missing Google credentials rather than silently
  // writing captures onto ephemeral serverless disk.
  return 'drive'
}

/** Absolute path of the local capture root, with ~ expanded. */
export function localRoot(): string {
  const configured = process.env['CAPTURE_LOCAL_DIR']
  if (!configured) throw new Error('CAPTURE_LOCAL_DIR is required when CAPTURE_STORAGE=local')
  const expanded = configured.startsWith('~')
    ? path.join(homedir(), configured.slice(1))
    : configured
  return path.resolve(expanded)
}

async function storeLocally(req: StoreRequest): Promise<StoredFile> {
  const relative = path.join(req.folder, req.filename)
  const absolute = path.join(localRoot(), relative)

  await mkdir(path.dirname(absolute), { recursive: true })
  await writeFile(absolute, req.bytes)

  // A file:// URL is unusable from a page, so hand back the read-back route
  // instead. Same shape as the Drive link, so the UI needs no special case.
  return {
    backend: 'local',
    id: relative,
    url: `/api/capture-file?id=${encodeURIComponent(relative)}`,
  }
}

export async function storeCapture(req: StoreRequest): Promise<StoredFile> {
  if (activeBackend() === 'local') return storeLocally(req)
  const file = await uploadToDrive(req)
  return { backend: 'drive', id: file.fileId, url: file.url }
}

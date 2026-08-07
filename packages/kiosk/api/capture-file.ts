/**
 * GET /api/capture-file?id=<relative path> — serve a locally-stored capture.
 *
 * The Drive backend hands the UI a real https link; the local backend has no
 * equivalent, because a file:// URL can't be opened from a page. This route
 * closes that gap so both backends expose the same thing: a URL the browser
 * can follow.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from './_lib/admin'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { activeBackend, localRoot } from './_lib/storage'

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!requireAdmin(req, res)) return

  if (activeBackend() !== 'local') {
    return res.status(404).json({ error: 'Local storage is not the active backend' })
  }

  const id = req.query['id']
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'id is required' })
  }

  try {
    const root = localRoot()
    const resolved = path.resolve(root, id)

    // `id` reaches us from a query string, so treat it as hostile: resolve
    // first, then confirm the result is still inside the capture root. Checking
    // for '..' in the raw string would miss symlinks and encoded traversal.
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      return res.status(403).json({ error: 'Path is outside the capture root' })
    }

    const info = await stat(resolved).catch(() => null)
    if (!info?.isFile()) {
      return res.status(404).json({ error: 'Capture not found' })
    }

    res.setHeader('Content-Type', CONTENT_TYPES[path.extname(resolved).toLowerCase()] ?? 'application/octet-stream')
    res.setHeader('Content-Length', String(info.size))
    res.setHeader('Cache-Control', 'private, max-age=3600')
    createReadStream(resolved).pipe(res)
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message })
  }
}

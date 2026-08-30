/**
 * GET /api/capture-file?id=… — serve a capture, whichever backend holds it.
 *
 * It used to serve only local files, on the reasoning that the Drive backend
 * already hands the UI a real https link. It does, and that link is
 * `webViewLink` — a Drive *page*. Fine to open in a tab, useless as an
 * `<img src>`, which is where My Work and the admin gallery actually put it, so
 * every thumbnail was a broken image.
 *
 * Drive could serve the picture directly if the files were link-shareable, and
 * that would put children's work behind a guessable public URL. So the bytes
 * come back through here instead, on the credential that wrote them, and the
 * files stay private. Both backends now expose the same thing: a URL the
 * browser can follow, and a picture at the end of it.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from '../_lib/admin.js'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { activeBackend, localRoot } from '../_lib/storage.js'
import { downloadFromDrive } from '../_lib/drive.js'

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

  const id = req.query['id']
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'id is required' })
  }

  if (activeBackend() === 'drive') {
    try {
      const file = await downloadFromDrive(id)
      res.setHeader('Content-Type', file.contentType)
      if (file.contentLength) res.setHeader('Content-Length', file.contentLength)
      // Private: this is one child's work, and a shared cache must not hold it.
      res.setHeader('Cache-Control', 'private, max-age=3600')
      if (!file.body) return res.end()
      for await (const chunk of file.body as unknown as AsyncIterable<Uint8Array>) res.write(chunk)
      return res.end()
    } catch (err) {
      return res.status(502).json({ error: (err as Error).message })
    }
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

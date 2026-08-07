/**
 * Admin surface gating.
 *
 * `/api/captures` and `/api/capture-file` expose every capture and every
 * student name. That is fine on a laptop and unacceptable on a public URL, so
 * the rule is default-deny where it matters:
 *
 *   ADMIN_TOKEN set        → require it, everywhere
 *   unset, non-production  → allow (local development stays zero-config)
 *   unset, production      → refuse
 *
 * The failure mode is deliberate. Forgetting to configure a token on a deploy
 * makes the admin routes disappear; the alternative would publish the roster.
 *
 * This is a guard, not an authentication system. Real per-user access arrives
 * with the teacher dashboard (roadmap Phase 2), which needs identity rather
 * than a shared secret.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

/** Constant-time compare so the token can't be recovered by timing the endpoint. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Returns true if the request may proceed. Sends the response itself when it
 * may not, so callers just `if (!requireAdmin(req, res)) return`.
 */
export function requireAdmin(req: VercelRequest, res: VercelResponse): boolean {
  const expected = process.env['ADMIN_TOKEN']

  if (!expected) {
    if (process.env['NODE_ENV'] === 'production') {
      // 404 rather than 403: an unconfigured admin surface shouldn't advertise
      // that it exists.
      res.status(404).json({ error: 'Not found' })
      return false
    }
    return true
  }

  const header = req.headers['x-admin-token']
  const provided = Array.isArray(header) ? header[0] : header ?? (typeof req.query['token'] === 'string' ? req.query['token'] : '')

  if (!provided || !safeEqual(provided, expected)) {
    res.status(401).json({ error: 'Admin token required' })
    return false
  }

  return true
}

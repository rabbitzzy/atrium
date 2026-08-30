/**
 * Admin surface gating, when there is any.
 *
 *   ADMIN_TOKEN set    → require it, everywhere
 *   ADMIN_TOKEN unset  → no gate
 *
 * One rule, and the deployment decides. It used to be three rules, with an
 * unset token meaning "allow" locally and "refuse" in production — default-deny
 * for a surface that shows every capture and every student name. That is the
 * right shape for a real pilot and the wrong shape for the staging deployment
 * this is now, where the gate was only ever something to get past: a token to
 * paste into `localStorage` on every origin, and two screens that answered
 * "Admin token required" until someone did.
 *
 * Turning it back on is setting the variable. Nothing else has to change,
 * because the callers still send the header when they have one.
 *
 * This was never an authentication system, and is less of one now. Real
 * per-user access arrives with the teacher dashboard (roadmap Phase 2), which
 * needs identity rather than a shared secret — and that is the thing to build
 * before real student work sits behind this.
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

  // No token configured, no gate. See the note above: this is a deliberate
  // relaxation for staging, not an oversight to be re-tightened by accident.
  if (!expected) return true

  const header = req.headers['x-admin-token']
  const provided = Array.isArray(header) ? header[0] : header ?? (typeof req.query['token'] === 'string' ? req.query['token'] : '')

  if (!provided || !safeEqual(provided, expected)) {
    res.status(401).json({ error: 'Admin token required' })
    return false
  }

  return true
}

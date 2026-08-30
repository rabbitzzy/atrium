/**
 * The admin token, on the browser's side of the gate.
 *
 * `api/_lib/admin.ts` refuses `/api/captures`, `/api/capture-file`,
 * `/api/teacher-queue` and the placement routes without a shared secret, which
 * every caller then has to remember to send. Four screens each grew their own
 * copy of that header, and the fifth — the admin captures list — did not, so it
 * asked the server for every capture in the hub and got a 401 it presented as
 * an error. One helper, so there is one place to forget.
 *
 * The token lives in `localStorage` per browser. That is a guard rather than an
 * authentication system, exactly as the server side says: real per-user access
 * arrives with the teacher dashboard, which needs identity and not a password
 * everyone shares.
 */

const KEY = 'atrium.adminToken'

export function adminToken(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function setAdminToken(token: string): void {
  try {
    if (token) localStorage.setItem(KEY, token)
    else localStorage.removeItem(KEY)
  } catch {
    /* a browser with storage disabled simply stays locked out */
  }
}

/** Spread into a fetch's headers. Empty when unset, so the 401 is the server's. */
export function adminHeader(): Record<string, string> {
  const t = adminToken()
  return t ? { 'x-admin-token': t } : {}
}

/**
 * For URLs a browser fetches on its own — an `<img src>` cannot carry a header,
 * so the server accepts the same secret as a query parameter.
 */
export function withAdminToken(url: string): string {
  const t = adminToken()
  if (!t) return url
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(t)}`
}

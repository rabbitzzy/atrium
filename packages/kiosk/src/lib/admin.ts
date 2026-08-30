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
 * The token lives in `localStorage` per browser, set once by whoever sets the
 * station up. There is deliberately no field for it in the UI: `#teacher` and
 * `#admin` are ungated hash routes that any child can type, so a box holding
 * the secret that opens every capture of every student does not belong on a
 * screen they can reach — least of all prefilled with the live value, where
 * devtools reads it straight out of the DOM. Setting it is a deployment step,
 * like the printer name.
 *
 * That it is a shared secret at all is the temporary part, and the reason not
 * to build UI around it. `api/_lib/admin.ts` calls itself a guard rather than
 * an authentication system, and real per-user access arrives with the teacher
 * dashboard, which needs identity instead of a password everyone knows.
 */

const KEY = 'atrium.adminToken'

export function adminToken(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
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

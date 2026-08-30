/**
 * Handing a Card to the printer, from the browser.
 *
 * ── Why the browser and not the server ──
 *
 * The print agent drives CUPS, so it has to run on the machine the printer is
 * plugged into. That machine sits on the school's LAN behind NAT, with an
 * address that means nothing on the public internet. While the kiosk's API
 * routes ran on the same machine this was invisible — `127.0.0.1:3003` was
 * simply true for everyone. Deployed, it stops being true for the half that
 * moved: a serverless function in a datacentre cannot open a connection *into*
 * a school network, and the fixes for that are a static IP and a firewall hole,
 * or a tunnel daemon that can die quietly on a Tuesday and take printing with
 * it.
 *
 * The browser is already on the right side of the firewall. It runs on the
 * kiosk machine, inches from the printer. So the PDF comes down from the API as
 * bytes and the page hands it to the agent itself, and every connection is
 * outbound from inside the LAN. No tunnel, no static IP, nothing inbound.
 *
 * Browsers permit this: `http://127.0.0.1` counts as a potentially trustworthy
 * origin, so an HTTPS page is allowed to call it and it is not blocked as mixed
 * content. Chrome does add a Private Network Access preflight on the way, which
 * the agent answers — see the middleware at the top of print-agent's index.ts.
 *
 * ── Configuration ──
 *
 * `localStorage`, the way `atrium.simulate` already works, rather than a build
 * time variable. One build serves every station, and a station whose agent sits
 * on a different box on the same LAN is a setting someone can change at the
 * machine instead of a redeploy.
 */

/** Where this station's print agent listens. Loopback unless told otherwise. */
export function printAgentUrl(): string {
  try {
    return localStorage.getItem('atrium.printAgent') || 'http://127.0.0.1:3003'
  } catch {
    // A kiosk with storage disabled still prints.
    return 'http://127.0.0.1:3003'
  }
}

export interface TrayState {
  /** True only when a printer is configured *and* CUPS says it is ready. */
  ready: boolean
  printer: string | null
}

/**
 * Is there paper, before a Leaf is spent?
 *
 * The check that used to sit at the top of `POST /api/card` and has to keep
 * sitting before generation wherever it runs. Generating is where the Leaf
 * goes and there is no refund path, so the cheapest thing the station can do
 * for a child is refuse before it costs them anything. An empty tray is the
 * likeliest failure in a school and it is knowable in one call.
 *
 * An unreachable agent returns null rather than a false `ready`: "the printer
 * has no paper" and "this station cannot find its printer" are different
 * problems for whoever has to fix them.
 */
export async function trayState(): Promise<TrayState | null> {
  try {
    const res = await fetch(`${printAgentUrl()}/health`)
    if (!res.ok) return null
    const body = (await res.json()) as { ready?: boolean; printer?: string | null }
    return { ready: body.ready === true, printer: body.printer ?? null }
  } catch {
    return null
  }
}

/** Thrown when the agent was reached and refused, so the reason is real. */
export class PrintRefused extends Error {}
/** Thrown when the agent could not be reached at all. */
export class PrintAgentUnreachable extends Error {}

/**
 * Put a Card on paper. Returns the CUPS job id when there is one.
 *
 * Every caller of this has already spent a Leaf, so the two failures are kept
 * apart deliberately: both cost the child the same, but only one of them is
 * fixed by checking the printer.
 */
export async function printCard(
  pdf: Blob,
  opts: { title: string; hold?: boolean },
): Promise<{ jobId: string | null }> {
  const query = new URLSearchParams({ title: opts.title })
  if (opts.hold) query.set('hold', '1')

  let res: Response
  try {
    res = await fetch(`${printAgentUrl()}/print?${query}`, {
      method: 'POST',
      headers: { 'content-type': 'application/pdf' },
      body: pdf,
    })
  } catch {
    throw new PrintAgentUnreachable(`no print agent at ${printAgentUrl()}`)
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new PrintRefused(detail.slice(0, 200) || `print agent answered ${res.status}`)
  }

  const body = (await res.json().catch(() => ({}))) as { jobId?: string }
  return { jobId: body.jobId ?? null }
}

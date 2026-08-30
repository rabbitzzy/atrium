/**
 * Putting a Card on paper, from the browser.
 *
 * ── Why there is no print agent any more ──
 *
 * There used to be a service on the kiosk machine that drove CUPS, because the
 * thing holding the Card was a server and a server cannot reach a printer it is
 * not next to. Two things removed the need for it. The Card is HTML rather than
 * a PDF, and a browser prints HTML natively; and the browser is already on the
 * machine the printer is plugged into. So the page prints, and nothing has to
 * run on that machine at all.
 *
 * ── What that costs, deliberately ──
 *
 * The agent's `/health` was the tray check, and the tray check was the only
 * refusal that cost a child nothing: it ran before generation, and generation
 * is where the Leaf goes. A browser cannot ask a printer whether it has paper,
 * so that check is gone and an empty tray now costs a Leaf. The recovery is the
 * one that already existed for a print that fails after the spend — a teacher
 * grants a replacement (BHCS-47). This was chosen with that understood; it is
 * not an oversight to be repaired by guessing at printer state.
 *
 * ── Silently, on a kiosk ──
 *
 * `print()` opens the browser's print dialog, which is wrong in front of a
 * seven-year-old. Chrome started with `--kiosk-printing` prints to the default
 * printer with no dialog at all, which is the intended station configuration.
 * Everywhere else the dialog appears and the Card still prints; the code is the
 * same either way.
 */

/** Thrown when the browser would not print. Rare, and not the child's fault. */
export class PrintFailed extends Error {}

/**
 * Print a Card, given the markup the worksheet service produced.
 *
 * The Card goes into a hidden iframe rather than the current document, because
 * the document is the kiosk UI: printing it would print the buttons. The iframe
 * carries the Card's own `@page` rules, so the sheet is sized and margin-free
 * exactly as the template intends.
 *
 * Resolves once the print has been handed to the browser. That is the last
 * thing this can honestly report — whether ink reached paper is not knowable
 * from here, which is the whole reason the outcome is reported rather than
 * assumed.
 */
export function printCardHtml(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    // Off-screen rather than `display: none`: a hidden frame is not guaranteed
    // to lay out, and a Card that never laid out prints blank.
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0'

    let settled = false
    const cleanup = () => {
      // After the print, not before: removing the frame while the browser is
      // still reading it prints an empty sheet.
      window.setTimeout(() => frame.remove(), 1000)
    }

    frame.onload = () => {
      if (settled) return
      settled = true
      try {
        const win = frame.contentWindow
        if (!win) throw new PrintFailed('the print frame did not open')
        win.focus()
        win.print()
        cleanup()
        resolve()
      } catch (err) {
        cleanup()
        reject(err instanceof Error ? err : new PrintFailed(String(err)))
      }
    }

    frame.onerror = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new PrintFailed('the Card could not be loaded for printing'))
    }

    document.body.appendChild(frame)
    const doc = frame.contentDocument
    if (!doc) {
      settled = true
      frame.remove()
      reject(new PrintFailed('the print frame has no document'))
      return
    }
    doc.open()
    doc.write(html)
    doc.close()
  })
}

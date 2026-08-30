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
    frame.setAttribute('aria-hidden', 'true')
    /*
     * Sized to the paper, parked off-screen.
     *
     * The first version made this 1px by 1px, on the reasoning that a hidden
     * frame need occupy no space. It printed blank sheets: the Card lays out
     * against the frame's viewport, and a one-pixel viewport lays out a
     * one-pixel Card. `@page` sizes the sheet, not the element that produced
     * it. So the frame is Letter-sized and simply pushed out of view, which
     * also keeps it out of the kiosk's own layout.
     */
    frame.style.cssText =
      'position:fixed;left:-10000px;top:0;width:215.9mm;height:279.4mm;border:0'

    let settled = false
    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      // After the print, not before: removing the frame while the browser is
      // still reading it prints an empty sheet.
      window.setTimeout(() => frame.remove(), 1000)
      if (err) reject(err)
      else resolve()
    }

    frame.onload = () => {
      void (async () => {
        try {
          const win = frame.contentWindow
          const doc = frame.contentDocument
          if (!win || !doc) throw new PrintFailed('the print frame did not open')

          /*
           * Wait for the pictures. The QR is an <img>, and it is the one thing
           * on the Card that has to survive a camera — a sheet printed before
           * it decoded is a Card that cannot be scanned back, which is worse
           * than one that did not print at all.
           */
          await Promise.all(
            Array.from(doc.images).map((img) =>
              img.complete
                ? Promise.resolve()
                : new Promise<void>((done) => {
                    img.addEventListener('load', () => done(), { once: true })
                    img.addEventListener('error', () => done(), { once: true })
                  }),
            ),
          )
          // One frame, so layout has certainly settled before the snapshot the
          // print takes.
          await new Promise<void>((done) => win.requestAnimationFrame(() => done()))

          win.focus()
          win.print()
          finish()
        } catch (err) {
          finish(err instanceof Error ? err : new PrintFailed(String(err)))
        }
      })()
    }

    frame.onerror = () => finish(new PrintFailed('the Card could not be loaded for printing'))

    // `srcdoc` rather than document.write: it is what the simulate screen
    // already uses to render the same markup, and it gives the frame a load
    // event that means what it says.
    frame.srcdoc = html
    document.body.appendChild(frame)
  })
}

/**
 * The fixed Card template (BHCS-36).
 *
 * `CLAUDE.md` picks the Gradescope approach on purpose: "same layout every time
 * means the camera can align answers to expected regions". The template that
 * existed did the opposite. Problems were laid out with flex and the answer box
 * followed the prompt, so a two-line question and a five-line question put
 * their answer boxes at different heights — and the evaluator, handed a photo,
 * had no way to know which was which without reading the whole page first.
 *
 * ── Everything here is measured in millimetres ──
 *
 * Not pixels. A Card is a physical object: it is printed at a physical size,
 * photographed, and cropped back to a rectangle of known proportions. Pixels
 * are a rendering detail that changes with DPI and would make every region
 * approximate. Millimetres against a Letter page survive the round trip, and
 * CSS prints them exactly.
 *
 * The regions this file computes are emitted as fractions of the page, so a
 * capture at any resolution can be cropped by multiplying. That is the whole
 * contract with the evaluator: it does not need to find the answer boxes,
 * because it already knows where they are.
 *
 * ── The corner marks do two jobs ──
 *
 * Four high-contrast squares, one deliberately different.
 *
 * The first job is alignment. Four known points let a photograph taken at an
 * angle be corrected back to a rectangle before anything is cropped. Three
 * identical marks and one ring means the corrected image also knows which way
 * up it is — a Card photographed upside down is otherwise perfectly plausible.
 *
 * The second job is the P0 in the roadmap. `docs/research/camera-focus.md`:
 * "a high-contrast fiducial inside the crop region would give contrast-detect
 * autofocus something to lock onto on a near-blank page. The Gradescope-style
 * fixed template needs one anyway." A worksheet is mostly white, which is the
 * worst case for the camera's autofocus; these give it an edge to hunt against.
 * They sit inside the crop region for exactly that reason.
 *
 * Pure geometry and string building. No network, no browser.
 */

/** US Letter, in millimetres. The station prints Letter, not A4. */
export const PAGE_W = 215.9
export const PAGE_H = 279.4

/** Corner marks: size and how far in from the paper edge they sit. */
export const FIDUCIAL_SIZE = 8
export const FIDUCIAL_INSET = 10

/** How many problem slots a Card has. Fixed — see `SLOT_H` for why. */
export const SLOT_COUNT = 5
/** Top of the first slot, below the header band. */
export const SLOT_TOP = 54
/**
 * One slot's total height. Fixed rather than per-problem: the moment a slot can
 * grow, every slot below it moves, and the region map stops being knowable
 * without rendering the page.
 *
 * Must stay at least `PROMPT_H + ANSWER_H`, or consecutive slots overlap. The
 * arithmetic is tight on Letter and the tests hold both ends of it: five slots
 * have to fit between the header rule and the bottom corner marks, and the last
 * answer box has to clear the footer.
 */
export const SLOT_H = 40
/** Prompt area inside a slot, above the answer box. */
export const PROMPT_H = 18

export const ANSWER_X = 24
export const ANSWER_W = 168
export const ANSWER_H = 20

export interface Rect {
  /** Fractions of the page, 0–1, origin top-left. */
  x: number
  y: number
  w: number
  h: number
}

export interface AnswerRegion extends Rect {
  number: number
}

/**
 * Where every answer box is, as fractions of the page.
 *
 * Computed from constants rather than measured from a render, which is the
 * point: this answer is available before the PDF exists and identical for every
 * Card the station ever prints.
 */
export function answerRegions(count: number = SLOT_COUNT): AnswerRegion[] {
  return Array.from({ length: Math.min(count, SLOT_COUNT) }, (_, i) => {
    const top = SLOT_TOP + i * SLOT_H + PROMPT_H
    return {
      number: i + 1,
      x: ANSWER_X / PAGE_W,
      y: top / PAGE_H,
      w: ANSWER_W / PAGE_W,
      h: ANSWER_H / PAGE_H,
    }
  })
}

/** Where the four corner marks are, for a de-skewer that wants to find them. */
export function fiducialRegions(): Array<Rect & { corner: string }> {
  const s = FIDUCIAL_SIZE
  const i = FIDUCIAL_INSET
  const spots: Array<[string, number, number]> = [
    ['top-left', i, i],
    ['top-right', PAGE_W - i - s, i],
    ['bottom-left', i, PAGE_H - i - s],
    ['bottom-right', PAGE_W - i - s, PAGE_H - i - s],
  ]
  return spots.map(([corner, x, y]) => ({
    corner,
    x: x / PAGE_W,
    y: y / PAGE_H,
    w: s / PAGE_W,
    h: s / PAGE_H,
  }))
}

/**
 * Font size for a prompt, by how long it is.
 *
 * The alternative was clipping, and clipping a question makes it unanswerable —
 * a child handed half a word problem cannot do anything with it, and the
 * system would grade them on it. Shrinking keeps the whole question on the page
 * and keeps the slot the size it has to be. Three steps rather than a formula,
 * because a continuously varying size looks like a mistake.
 */
export function promptFontMm(text: string): number {
  if (text.length <= 60) return 4.6
  if (text.length <= 120) return 4.0
  return 3.4
}

export interface CardProblem {
  number: number
  promptEn: string
  promptZh: string
}

export interface CardMeta {
  studentId: string
  taskId: string
  subject: string
  difficulty: number
  qrDataUrl: string
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function fiducialHtml(): string {
  return fiducialRegions()
    .map((f) => {
      // Bottom-right is a ring so a corrected image knows which way up it is.
      // A Card photographed upside down is otherwise perfectly plausible.
      const ring = f.corner === 'bottom-right'
      const style = `left:${(f.x * PAGE_W).toFixed(2)}mm;top:${(f.y * PAGE_H).toFixed(2)}mm;width:${FIDUCIAL_SIZE}mm;height:${FIDUCIAL_SIZE}mm`
      return `<div class="fid${ring ? ' ring' : ''}" style="${style}"></div>`
    })
    .join('')
}

export function renderFixedCard(problems: CardProblem[], meta: CardMeta): string {
  const slots = problems.slice(0, SLOT_COUNT).map((p, i) => {
    const top = SLOT_TOP + i * SLOT_H
    const answerTop = top + PROMPT_H
    return `
    <div class="slot" style="top:${top}mm">
      <div class="num">${p.number}</div>
      <div class="prompt">
        <div class="en" style="font-size:${promptFontMm(p.promptEn)}mm">${esc(p.promptEn)}</div>
        <div class="zh" style="font-size:${promptFontMm(p.promptZh)}mm">${esc(p.promptZh)}</div>
      </div>
    </div>
    <div class="answer" style="top:${answerTop}mm"></div>`
  })

  return `<!doctype html><html lang="zh"><head><meta charset="UTF-8"/>
<style>
  @page { size: ${PAGE_W}mm ${PAGE_H}mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    position: relative;
    width: ${PAGE_W}mm; height: ${PAGE_H}mm;
    font-family: 'DM Sans', 'PingFang SC', 'Noto Sans CJK SC', Arial, sans-serif;
    color: #000;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  /* Corner marks. Pure black on white: the highest contrast the printer can
     give the camera, which is the whole point of them being here. */
  .fid { position: absolute; background: #000; }
  .fid.ring { background: #000; border: 1.6mm solid #000; }
  .fid.ring::after {
    content: ''; position: absolute; inset: 1.6mm; background: #fff;
  }

  .header { position: absolute; left: ${FIDUCIAL_INSET + FIDUCIAL_SIZE + 4}mm; top: ${FIDUCIAL_INSET}mm; right: ${FIDUCIAL_INSET + FIDUCIAL_SIZE + 4}mm; height: 34mm; }
  .title { font-size: 6mm; font-weight: 700; margin: 0 0 1mm; letter-spacing: -0.02em; }
  .subject { font-size: 4mm; font-weight: 500; margin-bottom: 1mm; }
  .meta { font-size: 2.6mm; color: #444; font-family: ui-monospace, monospace; }
  .qr { position: absolute; right: 0; top: 0; width: 22mm; height: 22mm; }
  .rule { position: absolute; left: ${FIDUCIAL_INSET}mm; right: ${FIDUCIAL_INSET}mm; top: ${SLOT_TOP - 6}mm; border-top: 0.6mm solid #000; }

  .slot { position: absolute; left: ${FIDUCIAL_INSET}mm; right: ${FIDUCIAL_INSET}mm; height: ${PROMPT_H}mm; display: flex; gap: 4mm; overflow: hidden; }
  .num { font-size: 5mm; font-weight: 700; width: 8mm; flex: none; }
  .prompt { flex: 1; }
  .en { line-height: 1.25; margin-bottom: 0.8mm; }
  .zh { line-height: 1.3; color: #333; }

  /* The answer box. Its position is the contract with the evaluator: same
     millimetre on every Card, whatever the question above it says. */
  .answer {
    position: absolute;
    left: ${ANSWER_X}mm; width: ${ANSWER_W}mm; height: ${ANSWER_H}mm;
    border: 0.5mm solid #666; border-radius: 1.5mm; background: #fff;
  }

  .footer { position: absolute; left: ${FIDUCIAL_INSET}mm; right: ${FIDUCIAL_INSET}mm; bottom: ${FIDUCIAL_INSET + FIDUCIAL_SIZE + 3}mm; font-size: 2.8mm; color: #2f6a4f; }
</style></head><body>
${fiducialHtml()}
<div class="header">
  <div class="title">Atrium</div>
  <div class="subject">${esc(meta.subject)}</div>
  <div class="meta">${esc(meta.studentId)} · ${esc(meta.taskId)} · grade ${meta.difficulty}</div>
  <img class="qr" src="${meta.qrDataUrl}" />
</div>
<div class="rule"></div>
${slots.join('')}
<div class="footer">🌿 Bring this back to earn your next Leaf. 交回这张卡就能获得下一片叶子。</div>
</body></html>`
}

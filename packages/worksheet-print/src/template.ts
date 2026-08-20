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

/**
 * How much of a Card a question gets, by the grade band of the Room it targets.
 *
 * A flat five-per-page wastes paper on a fifth-grader doing arithmetic facts
 * and crowds a five-year-old writing their first characters. But the obvious
 * rule — older child, more questions — is only half right, and the half that is
 * wrong matters: older work needs *more* room per question, not less, because
 * multi-step arithmetic has to be carried somewhere.
 *
 * So the count rises only as far as the prompts shrink to allow. Each band
 * carries a character budget that goes into the generation prompt, and a
 * fifth-grade Card holds nine questions because nine grade-5 arithmetic
 * questions are short — not because a page can hold nine of anything.
 *
 * Three fixed layouts rather than one, which keeps BHCS-36's actual guarantee:
 * the answer regions are computable from constants before the page is rendered.
 * They are no longer the *same* for every Card, so a scan is matched against
 * the regions stored on its own task — which `rubric_json` has held since
 * BHCS-37 and which is the reason that was worth storing.
 *
 * Where the working goes is the other half of the answer, and it is why Cards
 * stay single-sided: the back is scratch space. A nine-slot Card leans on that
 * harder than a five-slot one does.
 */
export interface Layout {
  /** Problem slots on the page. */
  slots: number
  /** Total height of one slot. */
  slotH: number
  /** Prompt area above the answer box. */
  promptH: number
  /** The answer box itself. */
  answerH: number
  /**
   * Roughly how long each prompt may be, in characters, passed to the model.
   * A budget the generator ignores produces a Card that overflows its slots.
   */
  promptChars: number
}

/**
 * Bands, not a formula. Three layouts can be looked at and argued with; a
 * continuously varying page cannot, and every Card would be its own geometry.
 */
export const LAYOUTS: Record<'early' | 'middle' | 'upper', Layout> = {
  // Grades 1–2. Big writing, room to work, few questions.
  early: { slots: 5, slotH: 40, promptH: 18, answerH: 20, promptChars: 110 },
  // Grades 3–4.
  middle: { slots: 7, slotH: 28, promptH: 14, answerH: 12, promptChars: 85 },
  // Grade 5. Nine only works because the prompts are held short.
  upper: { slots: 9, slotH: 22, promptH: 11, answerH: 9, promptChars: 60 },
}

export function layoutFor(difficulty: number): Layout {
  if (difficulty <= 2) return LAYOUTS.early
  if (difficulty <= 4) return LAYOUTS.middle
  return LAYOUTS.upper
}

/** The old constants, kept as the default band so nothing silently changes. */
export const SLOT_COUNT = LAYOUTS.early.slots
export const SLOT_H = LAYOUTS.early.slotH
export const PROMPT_H = LAYOUTS.early.promptH
export const ANSWER_H = LAYOUTS.early.answerH

/** Top of the first slot, below the header band. Same for every layout. */
export const SLOT_TOP = 54

export const ANSWER_X = 24
export const ANSWER_W = 168

/**
 * The lowest a slot may reach: clear of the footer and the bottom corner marks.
 * Asserted in the tests for every layout, because the arithmetic is tight on
 * Letter and the first draft of the five-slot version failed exactly here.
 */
export const SLOT_BOTTOM_LIMIT = PAGE_H - FIDUCIAL_INSET - FIDUCIAL_SIZE - 9

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
export function answerRegions(count: number = SLOT_COUNT, difficulty = 1): AnswerRegion[] {
  const layout = layoutFor(difficulty)
  return Array.from({ length: Math.min(count, layout.slots) }, (_, i) => {
    const top = SLOT_TOP + i * layout.slotH + layout.promptH
    return {
      number: i + 1,
      x: ANSWER_X / PAGE_W,
      y: top / PAGE_H,
      w: ANSWER_W / PAGE_W,
      h: layout.answerH / PAGE_H,
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
export function promptFontMm(text: string, layout: Layout = LAYOUTS.early): number {
  // Scaled to the band: a nine-slot Card has 11mm of prompt area for two
  // languages, so the same three steps have to start smaller.
  const base = layout.promptH >= 18 ? 4.6 : layout.promptH >= 14 ? 4.0 : 3.4
  const step =
    text.length <= layout.promptChars * 0.55 ? 0 : text.length <= layout.promptChars ? 0.6 : 1.2
  // Rounded because these land in CSS: `font-size:3.3999999999999995mm` is a
  // rendering detail leaking into the page, and one decimal is finer than any
  // printer resolves anyway.
  return Math.round((base - step) * 10) / 10
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
  const layout = layoutFor(meta.difficulty)
  const slots = problems.slice(0, layout.slots).map((p, i) => {
    const top = SLOT_TOP + i * layout.slotH
    const answerTop = top + layout.promptH
    return `
    <div class="slot" style="top:${top}mm">
      <div class="num">${p.number}</div>
      <div class="prompt">
        <div class="en" style="font-size:${promptFontMm(p.promptEn, layout)}mm">${esc(p.promptEn)}</div>
        <div class="zh" style="font-size:${promptFontMm(p.promptZh, layout)}mm">${esc(p.promptZh)}</div>
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

  .slot { position: absolute; left: ${FIDUCIAL_INSET}mm; right: ${FIDUCIAL_INSET}mm; height: ${layout.promptH}mm; display: flex; gap: 4mm; overflow: hidden; }
  .num { font-size: 5mm; font-weight: 700; width: 8mm; flex: none; }
  .prompt { flex: 1; }
  .en { line-height: 1.25; margin-bottom: 0.8mm; }
  .zh { line-height: 1.3; color: #333; }

  /* The answer box. Its position is the contract with the evaluator: same
     millimetre on every Card, whatever the question above it says. */
  .answer {
    position: absolute;
    left: ${ANSWER_X}mm; width: ${ANSWER_W}mm; height: ${layout.answerH}mm;
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

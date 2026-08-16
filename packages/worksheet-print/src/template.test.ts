import { describe, expect, it } from 'vitest'
import {
  ANSWER_H,
  ANSWER_W,
  answerRegions,
  FIDUCIAL_INSET,
  FIDUCIAL_SIZE,
  fiducialRegions,
  PAGE_H,
  PAGE_W,
  promptFontMm,
  renderFixedCard,
  SLOT_COUNT,
  type CardProblem,
} from './template.js'

const problem = (n: number, en: string, zh = '中文'): CardProblem => ({
  number: n,
  promptEn: en,
  promptZh: zh,
})

const META = {
  studentId: 'stu-1',
  taskId: '11111111-2222-3333-4444-555555555555',
  subject: 'Add 3-digit numbers / 三位数进位加法',
  difficulty: 2,
  qrDataUrl: 'data:image/png;base64,AAAA',
}

describe('answerRegions', () => {
  // The whole contract with the evaluator: it does not have to find the boxes.
  it('puts every answer box at the same place on every Card', () => {
    const short = answerRegions(5)
    const long = answerRegions(5)
    expect(short).toEqual(long)
  })

  it('is evenly spaced and never overlaps', () => {
    const regions = answerRegions(SLOT_COUNT)
    for (let i = 1; i < regions.length; i++) {
      expect(regions[i]!.y).toBeGreaterThan(regions[i - 1]!.y + regions[i - 1]!.h)
    }
    const gaps = regions.slice(1).map((r, i) => r.y - regions[i]!.y)
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0]!, 12)
  })

  it('stays on the page, with room for the bottom corner marks', () => {
    const last = answerRegions(SLOT_COUNT).at(-1)!
    const bottomFiducialTop = (PAGE_H - FIDUCIAL_INSET - FIDUCIAL_SIZE) / PAGE_H
    expect(last.y + last.h).toBeLessThan(bottomFiducialTop)
  })

  it('leaves a gap between one answer box and the next slot', () => {
    const regions = answerRegions(SLOT_COUNT)
    for (let i = 1; i < regions.length; i++) {
      const gap = (regions[i]!.y - (regions[i - 1]!.y + regions[i - 1]!.h)) * PAGE_H
      expect(gap).toBeGreaterThan(0)
    }
  })

  it('reports fractions of the page, so any capture resolution can crop', () => {
    for (const r of answerRegions()) {
      for (const v of [r.x, r.y, r.w, r.h]) {
        expect(v).toBeGreaterThan(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })

  it('multiplies back to the millimetres it was built from', () => {
    const first = answerRegions()[0]!
    expect(first.w * PAGE_W).toBeCloseTo(ANSWER_W, 10)
    expect(first.h * PAGE_H).toBeCloseTo(ANSWER_H, 10)
  })

  it('never returns more slots than the fixed layout has', () => {
    expect(answerRegions(99)).toHaveLength(SLOT_COUNT)
    expect(answerRegions(3)).toHaveLength(3)
  })
})

describe('fiducialRegions', () => {
  it('marks all four corners', () => {
    expect(fiducialRegions().map((f) => f.corner).sort()).toEqual([
      'bottom-left',
      'bottom-right',
      'top-left',
      'top-right',
    ])
  })

  it('sits inside the page, which is where autofocus needs it', () => {
    for (const f of fiducialRegions()) {
      expect(f.x).toBeGreaterThan(0)
      expect(f.y).toBeGreaterThan(0)
      expect(f.x + f.w).toBeLessThan(1)
      expect(f.y + f.h).toBeLessThan(1)
    }
  })

  it('does not collide with any answer box', () => {
    const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    for (const f of fiducialRegions()) {
      for (const r of answerRegions()) expect(overlaps(f, r)).toBe(false)
    }
  })
})

describe('promptFontMm', () => {
  // Clipping a question makes it unanswerable, and the child gets graded on it.
  it('shrinks a long prompt rather than letting it overflow its slot', () => {
    expect(promptFontMm('x'.repeat(200))).toBeLessThan(promptFontMm('short'))
  })

  it('steps rather than sliding, so it does not look like a mistake', () => {
    const sizes = new Set([40, 100, 200].map((n) => promptFontMm('x'.repeat(n))))
    expect(sizes.size).toBe(3)
  })

  it('never goes below legibility for a child', () => {
    expect(promptFontMm('x'.repeat(5000))).toBeGreaterThanOrEqual(3.4)
  })
})

describe('renderFixedCard', () => {
  const html = renderFixedCard(
    [problem(1, '247 + 385 = ?'), problem(2, 'x'.repeat(150)), problem(3, '8 × 7 = ?')],
    META,
  )

  it('sets the page to the paper it prints on', () => {
    expect(html).toContain(`size: ${PAGE_W}mm ${PAGE_H}mm`)
    expect(html).toContain('margin: 0')
  })

  it('draws four corner marks, one of them distinguishable', () => {
    expect((html.match(/class="fid/g) ?? [])).toHaveLength(4)
    expect((html.match(/class="fid ring"/g) ?? [])).toHaveLength(1)
  })

  it('places every answer box at its computed millimetre', () => {
    for (const r of answerRegions(3)) {
      expect(html).toContain(`top:${(r.y * PAGE_H).toFixed(0)}`)
    }
    expect((html.match(/class="answer"/g) ?? [])).toHaveLength(3)
  })

  it('carries the QR and both halves of the identity in the header', () => {
    expect(html).toContain(META.qrDataUrl)
    expect(html).toContain('stu-1')
    expect(html).toContain(META.taskId)
  })

  it('escapes model output rather than letting it open a tag', () => {
    const risky = renderFixedCard([problem(1, 'Is 5 < 8?', '5 < 8 吗？')], META)
    expect(risky).toContain('5 &lt; 8')
    expect(risky).not.toContain('<8?')
  })

  it('never renders more slots than the layout holds', () => {
    const many = renderFixedCard(
      Array.from({ length: 12 }, (_, i) => problem(i + 1, `q${i}`)),
      META,
    )
    expect((many.match(/class="answer"/g) ?? [])).toHaveLength(SLOT_COUNT)
  })

  it('tells the student the Card is worth a Leaf, in both languages', () => {
    expect(html).toContain('Leaf')
    expect(html).toContain('叶子')
  })
})

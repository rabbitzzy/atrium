import QRCode from 'qrcode'
import puppeteer from 'puppeteer'
import { fetchRooms } from './blueprint.js'
import { renderFixedCard } from './template.js'
import {
  buildProblemPrompt,
  PROBLEM_SCHEMA,
  ProblemGenerationError,
  validateProblems,
  type GeneratedProblem,
  type TargetRoom,
} from './problems.js'

const GEMINI_MODEL = process.env['GEMINI_MODEL'] ?? 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

export interface CardRequest {
  studentId: string
  taskId: string
  kcIds: string[]
  /**
   * Optional override. Left out — which is the normal case — the Card is set at
   * the hardest Room it targets, because 004 seeds every Room with the grade
   * band it belongs to and that is a better answer than a caller's guess.
   */
  difficulty?: number
}

/**
 * A Card, as a PDF (BHCS-35).
 *
 * This used to return `Buffer.from(html)` under a `Content-Type:
 * application/pdf` header — HTML bytes wearing a PDF label, which no printer
 * would render. The v0 routes had been going through Puppeteer correctly all
 * along; the generated path never did.
 *
 * Order matters: problems are generated and validated *before* the QR code and
 * the render, so a generation failure throws while nothing has been committed.
 * Everything downstream of here spends something.
 */
export async function generateCard(req: CardRequest): Promise<Buffer> {
  const rooms = await fetchRooms(req.kcIds)
  const problems = await generateProblems(rooms)
  const difficulty = req.difficulty ?? Math.max(...rooms.map((r) => r.difficulty))

  const qrDataUrl = await QRCode.toDataURL(
    JSON.stringify({ studentId: req.studentId, taskId: req.taskId }),
  )
  const html = renderFixedCard(problems, {
    studentId: req.studentId,
    taskId: req.taskId,
    subject: rooms.map((r) => `${r.labelEn} / ${r.labelZh}`).join(' + '),
    difficulty,
    qrDataUrl,
  })

  const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({ format: 'Letter', printBackground: true })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

/**
 * Ask Gemini for problems, and refuse anything that would waste a sheet.
 *
 * Schema-constrained rather than parsed hopefully: the old call asked only for
 * `response_mime_type: application/json` and swallowed a parse failure into an
 * empty array, which rendered a Card with a header, a QR code and no questions.
 */
async function generateProblems(rooms: TargetRoom[]): Promise<GeneratedProblem[]> {
  const res = await fetch(`${GEMINI_URL}?key=${process.env['GEMINI_API_KEY']}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildProblemPrompt(rooms) }] }],
      generationConfig: {
        response_mime_type: 'application/json',
        response_schema: PROBLEM_SCHEMA,
      },
    }),
  })
  if (!res.ok) {
    throw new ProblemGenerationError(`Gemini answered ${res.status}: ${await res.text()}`)
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!raw) throw new ProblemGenerationError('Gemini returned no content')

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ProblemGenerationError('Gemini returned text that is not JSON')
  }
  return validateProblems(parsed)
}

// ─── v0 hardcoded worksheet ───────────────────────────────────────────────────

export const V0_TASK_ID = 'task-v0-001'

interface V0Problem {
  number: number
  en: string
  zh: string
  answer: string
  answerLines: number
}

export const V0_PROBLEMS: V0Problem[] = [
  { number: 1, en: '247 + 385 = ___', zh: '三位数加法', answer: '632', answerLines: 1 },
  { number: 2, en: '502 − 278 = ___', zh: '减法借位', answer: '224', answerLines: 1 },
  { number: 3, en: '8 × 7 = ___', zh: '乘法', answer: '56', answerLines: 1 },
  { number: 4, en: '1/3 + 1/6 = ___', zh: '分数加法', answer: '1/2 (also accept 3/6)', answerLines: 1 },
  { number: 5, en: 'Xiao Ming had 24 apples. He gave 8 to a friend, then bought 15 more. How many apples does he have now?', zh: '小明有24个苹果。他给了朋友8个，又买了15个。他现在有几个苹果？', answer: '24 - 8 = 16\n16 + 15 = 31', answerLines: 2 },
]

export async function renderV0FilledHtml(): Promise<string> {
  return renderV0HtmlBase(true)
}

export async function renderV0Html(): Promise<string> {
  return renderV0HtmlBase(false)
}

async function renderV0HtmlBase(filled: boolean): Promise<string> {
  const qrDataUrl = await QRCode.toDataURL(JSON.stringify({ taskId: V0_TASK_ID }), { width: 90 })

  const problemsHtml = V0_PROBLEMS.map((p) => {
    const answerContent = filled
      ? `<div class="answer-text">${p.answer}</div>`
      : ''
    return `
    <div class="problem">
      <div class="num">${p.number}</div>
      <div class="body">
        <div class="en">${p.en}</div>
        <div class="zh">${p.zh}</div>
        <div class="answer-box" style="height:${p.answerLines * 52}px">${answerContent}</div>
      </div>
    </div>`
  }).join('')

  return `<!doctype html><html lang="zh"><head>
<meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'DM Sans', Arial, sans-serif; max-width: 680px; margin: 0 auto; padding: 28px 24px; color: #1a1a2e; }
  .print-btn { display: block; margin-bottom: 20px; padding: 10px 24px; background: #1a1a2e; color: #fff; border: none; border-radius: 8px; font-family: inherit; font-size: 15px; font-weight: 600; cursor: pointer; }
  @media print { .print-btn { display: none; } }
  .ws-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a1a2e; padding-bottom: 14px; margin-bottom: 20px; }
  .ws-title { font-size: 22px; font-weight: 700; margin: 0 0 4px; }
  .ws-sub { font-size: 13px; color: #888; }
  .ws-meta { display: flex; gap: 40px; margin-bottom: 24px; font-size: 14px; }
  .ws-meta .line { display: inline-block; border-bottom: 1.5px solid #333; width: 160px; }
  .problem { display: flex; gap: 14px; margin-bottom: 24px; page-break-inside: avoid; }
  .num { font-weight: 700; font-size: 20px; min-width: 28px; padding-top: 2px; }
  .body { flex: 1; }
  .en { font-size: 18px; font-weight: 500; margin-bottom: 3px; }
  .zh { font-size: 14px; color: #666; margin-bottom: 10px; }
  .answer-box { border: 2px solid #bbb; border-radius: 6px; background: #fafafa; width: 100%; max-width: 480px; padding: 8px 12px; }
  .answer-text { font-size: 18px; color: #333; white-space: pre-line; }
  .ws-footer { margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px; display: flex; justify-content: space-between; font-size: 12px; color: #bbb; }
</style>
</head><body>
<button class="print-btn" onclick="window.print()">🖨️ Print Worksheet</button>
<div class="ws-header">
  <div>
    <p class="ws-title">Atrium — Learning Card 学习卡</p>
    <p class="ws-sub">Bright Horizon Chinese School · v0 · ${V0_TASK_ID}</p>
  </div>
  <img src="${qrDataUrl}" width="80" height="80" alt="QR"/>
</div>
<div class="ws-meta">
  <div>Name 姓名: <span class="line"></span></div>
  <div>Date 日期: <span class="line" style="width:110px"></span></div>
</div>
${problemsHtml}
<div class="ws-footer">
  <span>Task: ${V0_TASK_ID}</span>
  <span>atrium.bhcs</span>
</div>
</body></html>`
}

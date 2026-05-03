import Anthropic from '@anthropic-ai/sdk'
import type { Beta } from '@anthropic-ai/sdk/resources/index.js'
import QRCode from 'qrcode'

export interface CardRequest {
  studentId: string
  taskId: string
  kcIds: string[]
  difficulty: number
}

// TODO: launch headless Chromium (via playwright or puppeteer) to render → PDF
// For now, returns a minimal HTML string as placeholder.
export async function generateCard(req: CardRequest): Promise<Buffer> {
  const problems = await generateProblems(req)
  const qrDataUrl = await QRCode.toDataURL(JSON.stringify({ studentId: req.studentId, taskId: req.taskId }))
  const html = renderCardHtml({ problems, qrDataUrl, req })

  // TODO: replace with actual PDF rendering via Chromium
  return Buffer.from(html, 'utf-8')
}

interface GeneratedProblem {
  number: number
  prompt: string
  promptZh: string
  answerLines: number
}

async function generateProblems(req: CardRequest): Promise<GeneratedProblem[]> {
  const client = new Anthropic()
  const systemBlock: Beta.PromptCaching.PromptCachingBetaTextBlockParam = {
    type: 'text',
    text: `You generate K-5 worksheet problems for a bilingual Chinese-English learning hub.
Output must be valid JSON: an array of objects with keys: number (int), prompt (English), promptZh (Chinese), answerLines (int 1-4).
Problems must target the given knowledge components at the given difficulty (1=easy, 5=hard).
Keep problems age-appropriate, unambiguous, and printable (no URLs, no images).`,
    cache_control: { type: 'ephemeral' },
  }
  const response = await client.beta.promptCaching.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [systemBlock],
    messages: [
      {
        role: 'user',
        content: `Generate 5 problems for KCs: ${req.kcIds.join(', ')}. Difficulty: ${req.difficulty}/5.`,
      },
    ],
  })

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : '[]'
  try {
    return JSON.parse(raw) as GeneratedProblem[]
  } catch {
    return []
  }
}

function renderCardHtml(args: { problems: GeneratedProblem[]; qrDataUrl: string; req: CardRequest }): string {
  const { problems, qrDataUrl, req } = args
  const problemsHtml = problems.map((p) => `
    <div class="problem">
      <div class="num">${p.number}.</div>
      <div class="body">
        <div class="en">${p.prompt}</div>
        <div class="zh">${p.promptZh}</div>
        ${'<div class="answer-line"></div>'.repeat(p.answerLines)}
      </div>
    </div>`).join('')
  return `<!doctype html><html><head><meta charset="UTF-8"/>
<style>
  body { font-family: 'DM Sans', sans-serif; max-width: 680px; margin: 32px auto; color: #1a1a2e; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1a1a2e; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { font-size: 22px; margin: 0; }
  .meta { font-size: 12px; color: #666; }
  .problem { display: flex; gap: 12px; margin-bottom: 28px; }
  .num { font-weight: 700; font-size: 18px; min-width: 24px; }
  .en { font-size: 16px; margin-bottom: 4px; }
  .zh { font-size: 14px; color: #555; margin-bottom: 8px; }
  .answer-line { border-bottom: 1px solid #bbb; height: 28px; margin-bottom: 6px; }
</style></head><body>
<div class="header">
  <div>
    <h1>Atrium — Learning Card</h1>
    <div class="meta">Student: ${req.studentId} · Task: ${req.taskId}</div>
  </div>
  <img src="${qrDataUrl}" width="80" height="80" />
</div>
${problemsHtml}
</body></html>`
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

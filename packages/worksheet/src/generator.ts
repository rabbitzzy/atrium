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

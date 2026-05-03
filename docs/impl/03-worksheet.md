# Worksheet Generator — Implementation Plan

Package: `packages/worksheet`  
Tech: Hono + Node, TypeScript, Anthropic SDK, Playwright, QRCode  
Port: 3002

## Responsibility
Generate a print-ready PDF Card for a given set of target KCs and a student.  
The PDF has a fixed layout so the evaluator can align answer regions deterministically (Gradescope-style).

## POST /generate — pipeline

```
Input: { studentId, taskId, kcIds[], difficulty }
         │
         ▼
0. Check leaf_balance for studentId via skill-graph service
   → If balance < 1: return 402 { error: "insufficient_leaves", balance: 0 }
   → If balance ≥ 1: continue
         │
         ▼
1. Call Claude claude-sonnet-4-6 with cached system prompt
   → JSON: [{number, prompt_en, prompt_zh, answerLines, expectedAnswerType}]
         │
         ▼
2. Generate QR code encoding { studentId, taskId } as DataMatrix / QR
         │
         ▼
3. Render HTML template (fixed layout, 3–5 problems per page)
         │
         ▼
4. Launch Playwright headless Chromium → print to PDF (A4)
         │
         ▼
5. Deduct 1 Leaf from studentId; log print_event { type: "spend", amount: 1 }
   → If PDF delivery fails (printer error), issue { type: "refund", amount: 1 }
         │
         ▼
Output: PDF buffer (streaming response)
```

## Fixed PDF layout

```
┌──────────────────────────────────────────────┐
│ ATRIUM                          [QR: 80×80]  │
│ Student: [id]  Task: [uuid]                  │
│ Subject: [label_en] / [label_zh]  Difficulty │
│                              🌿 Leaf earned on submit │
├──────────────────────────────────────────────┤
│ 1. [problem prompt EN]                       │
│    [problem prompt ZH]                       │
│    ___________________________________________│
│                                              │
│ 2. …                                         │
│    …                                         │
│    ___________________________________________│
│    ___________________________________________│
│                                              │
│ (3–5 problems per page; never print a mostly-blank Card) │
└──────────────────────────────────────────────┘
```

Answer lines are sized consistently: 28px tall, full width. The evaluator uses the QR code to fetch the rubric and maps answer regions by line index.

The small "🌿 Leaf earned on submit" footer line is a reminder to the student that returning this Card earns them their next print credit. Keep it small — it is a cue, not a lecture.

## LLM problem generation — prompt design

The system prompt is sent with `cache_control: { type: "ephemeral" }` so it is cached across all generation calls within a 5-minute window. This saves ~60% of token cost for high-throughput sessions.

**Constraints enforced in prompt:**
- Problems must be solvable without a calculator or internet
- No images or diagrams (printable text only)
- Bilingual: English prompt + Chinese translation, both required
- Difficulty 1: single-step, no abstraction; Difficulty 5: multi-step, requires inference
- Output must be valid JSON array — no prose, no markdown fences

**Fallback:** if Claude returns malformed JSON, retry once with `max_tokens` increased. If still malformed, fall back to Gemini Flash.

## Playwright setup

```typescript
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
const pdf = await page.pdf({ format: 'A4', printBackground: true })
await browser.close()
return pdf
```

Keep the browser instance warm across requests (module-level singleton) to avoid cold-start latency.

## Environment variables

```
ANTHROPIC_API_KEY=
PORT=3002
```

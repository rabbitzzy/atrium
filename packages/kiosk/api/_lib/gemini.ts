/**
 * Gemini vision calls with schema-constrained JSON output.
 *
 * Every capture goes through visionJson() or visionJsonStream(), so the model,
 * timing, and error shape are uniform across apps — that uniformity is what
 * lets captures.ocr_status / ocr_ms mean the same thing regardless of kind.
 *
 * The two differ only in when the caller hears about the answer, never in what
 * the answer is: both resolve to the same parsed object, from the same request
 * body, and a streamed capture is stored exactly as a buffered one is.
 */

import type { GeminiSchema } from '@atrium/schema'
import { parsePartialJson } from './partial-json.js'

const MODEL = process.env['GEMINI_MODEL'] ?? 'gemini-2.5-flash'
const endpoint = (method: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:${method}`

export interface VisionResult<T> {
  data: T
  model: string
  ms: number
}

interface VisionArgs {
  image: Buffer
  mimeType: string
  systemPrompt: string
  userPrompt: string
  schema: GeminiSchema
}

/** The one request body both transports send. */
function requestBody(args: VisionArgs): string {
  return JSON.stringify({
    system_instruction: { parts: [{ text: args.systemPrompt }] },
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: args.mimeType, data: args.image.toString('base64') } },
          { text: args.userPrompt },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: args.schema,
    },
  })
}

function apiKey(): string {
  const key = process.env['GEMINI_API_KEY']
  if (!key) throw new Error('Missing env var GEMINI_API_KEY')
  return key
}

export async function visionJson<T>(args: VisionArgs): Promise<VisionResult<T>> {
  const startedAt = Date.now()
  const res = await fetch(`${endpoint('generateContent')}?key=${apiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: requestBody(args),
  })

  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${await res.text()}`)
  }

  const payload = (await res.json()) as GeminiChunk

  const candidate = payload.candidates?.[0]
  // A blocked or truncated response still returns 200 — the parts array is
  // simply absent. Surfacing finishReason here saves a lot of guessing later.
  const text = candidate?.content?.parts?.[0]?.text
  if (!text) {
    throw new Error(`Gemini returned no content (finishReason: ${candidate?.finishReason ?? 'unknown'})`)
  }

  return { data: JSON.parse(text) as T, model: MODEL, ms: Date.now() - startedAt }
}

/**
 * The same call, delivered as it is written (BHCS-10).
 *
 * `onPartial` receives the largest well-formed value the response contains so
 * far, and only when that value has actually changed — a chunk that adds three
 * characters to a string nobody can see yet is not an update. What arrives is
 * the app's own schema shape with fields missing, so an app consuming this
 * needs no second format.
 *
 * The final resolved value is parsed from the accumulated text with the strict
 * parser, not from the last partial: what gets stored is real JSON from the
 * model or it is an error, never a repair.
 */
export async function visionJsonStream<T>(
  args: VisionArgs & { onPartial: (partial: unknown) => void },
): Promise<VisionResult<T>> {
  const startedAt = Date.now()
  const res = await fetch(`${endpoint('streamGenerateContent')}?alt=sse&key=${apiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: requestBody(args),
  })

  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${await res.text()}`)
  }
  if (!res.body) throw new Error('Gemini returned no stream')

  let text = ''
  let lastSent: string | undefined
  let finishReason: string | undefined

  for await (const chunk of sseData(res.body)) {
    let parsed: GeminiChunk
    try {
      parsed = JSON.parse(chunk) as GeminiChunk
    } catch {
      // A frame we cannot read is not worth failing a capture over; the
      // accumulated text is validated strictly at the end regardless.
      continue
    }

    const candidate = parsed.candidates?.[0]
    finishReason = candidate?.finishReason ?? finishReason
    const delta = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    if (!delta) continue

    text += delta
    const partial = parsePartialJson(text)
    if (partial === undefined) continue

    // Compared as text, because most chunks extend a value that is not yet
    // showable — three more characters of an unterminated string is not news.
    const snapshot = JSON.stringify(partial)
    if (snapshot === lastSent) continue
    lastSent = snapshot
    onPartialSafely(args.onPartial, partial)
  }

  if (!text) {
    throw new Error(`Gemini returned no content (finishReason: ${finishReason ?? 'unknown'})`)
  }

  // A stream cut off mid-object parses as a syntax error here, which is the
  // right outcome: the capture is marked failed, the image is already stored,
  // and the row is replayable. Persisting a repaired object would put a
  // half-read worksheet in a teacher's hands looking like a whole one.
  return { data: JSON.parse(text) as T, model: MODEL, ms: Date.now() - startedAt }
}

/** A partial nobody could deliver must not cost the capture its result. */
function onPartialSafely(onPartial: (p: unknown) => void, partial: unknown): void {
  try {
    onPartial(partial)
  } catch {
    // The client is gone or the socket is closed. The extraction continues and
    // still lands in the row — the student's page is what matters, not the
    // screen they walked away from.
  }
}

interface GeminiChunk {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
}

/**
 * The `data:` payloads of an SSE body, in order.
 *
 * Deliberately minimal: Gemini sends one single-line `data:` field per event
 * and no ids, retries, or multi-line payloads, so anything more would be
 * machinery for a shape this endpoint never emits.
 */
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // Frames are newline-delimited, and a chunk boundary can land anywhere —
      // including mid-frame, which is why the tail stays in the buffer.
      let newline: number
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line.startsWith('data:')) yield line.slice(5).trim()
      }
    }
  } finally {
    reader.releaseLock()
  }
}

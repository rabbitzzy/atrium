/**
 * Gemini vision calls with schema-constrained JSON output.
 *
 * Every pipeline goes through visionJson(), so the model, timing, and error
 * shape are uniform across worksheet and chess OCR — that uniformity is what
 * lets captures.ocr_status / ocr_ms mean the same thing regardless of kind.
 */

const MODEL = process.env['GEMINI_MODEL'] ?? 'gemini-2.5-flash'
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

/**
 * Gemini's schema dialect is an OpenAPI subset: uppercase type names, and
 * `nullable` instead of a union with null. It is close enough to JSON Schema
 * to be confusing, so the pipelines declare schemas in this shape directly
 * rather than converting.
 */
export interface GeminiSchema {
  type: 'OBJECT' | 'ARRAY' | 'STRING' | 'INTEGER' | 'NUMBER' | 'BOOLEAN'
  properties?: Record<string, GeminiSchema>
  items?: GeminiSchema
  required?: string[]
  propertyOrdering?: string[]
  nullable?: boolean
  enum?: string[]
  description?: string
}

export interface VisionResult<T> {
  data: T
  model: string
  ms: number
}

export async function visionJson<T>(args: {
  image: Buffer
  mimeType: string
  systemPrompt: string
  userPrompt: string
  schema: GeminiSchema
}): Promise<VisionResult<T>> {
  const apiKey = process.env['GEMINI_API_KEY']
  if (!apiKey) throw new Error('Missing env var GEMINI_API_KEY')

  const startedAt = Date.now()
  const res = await fetch(`${URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
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
    }),
  })

  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${await res.text()}`)
  }

  const payload = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
  }

  const candidate = payload.candidates?.[0]
  // A blocked or truncated response still returns 200 — the parts array is
  // simply absent. Surfacing finishReason here saves a lot of guessing later.
  const text = candidate?.content?.parts?.[0]?.text
  if (!text) {
    throw new Error(`Gemini returned no content (finishReason: ${candidate?.finishReason ?? 'unknown'})`)
  }

  return { data: JSON.parse(text) as T, model: MODEL, ms: Date.now() - startedAt }
}

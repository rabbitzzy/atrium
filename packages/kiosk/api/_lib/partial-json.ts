/**
 * Read a JSON document that is not finished being written.
 *
 * `response_schema` means what streams back from Gemini is a single JSON
 * object arriving a few characters at a time, so every intermediate state is
 * syntactically broken and `JSON.parse` rejects all of them. This turns each
 * of those states into the largest well-formed value it contains:
 *
 *     {"questions":[{"number":1,"quality":"mastered","transc
 *  →  { questions: [ { number: 1, quality: 'mastered' } ] }
 *
 * Two rules decide everything, and both err towards showing less:
 *
 *  - **A value appears only once it cannot change.** `"mastere` is dropped
 *    rather than shown, because the next chunk may finish it as `"mastered"`.
 *    A bare `3` at the end of the buffer is dropped for the same reason — the
 *    next character could make it `31`. A child reading a Debrief must never
 *    watch a word rewrite itself.
 *  - **Containers are kept, partially filled.** An array element that has
 *    started but not closed is still handed over with whatever fields have
 *    landed. That is the progressive rendering this exists for: question 1 is
 *    on screen while question 4 is still arriving.
 *
 * Pure and total: any input, no throw. Nothing here knows what a worksheet is.
 */

/** Nothing parseable yet — an empty buffer, or a value too incomplete to show. */
const NOTHING = undefined

interface Parsed {
  value: unknown
  /** False when input ran out mid-value: the value is real but may still grow. */
  complete: boolean
}

class Cursor {
  i = 0
  constructor(readonly s: string) {}

  get done(): boolean {
    return this.i >= this.s.length
  }

  skipWhitespace(): void {
    while (this.i < this.s.length && ' \t\n\r'.includes(this.s[this.i]!)) this.i++
  }

  peek(): string | undefined {
    return this.s[this.i]
  }
}

/**
 * The best-effort value in `text`, or `undefined` if there is not yet one.
 *
 * Trailing garbage after a complete top-level value is ignored rather than
 * treated as an error — a truncated stream is the normal case here.
 */
export function parsePartialJson(text: string): unknown {
  const parsed = parseValue(new Cursor(text))
  return parsed ? parsed.value : NOTHING
}

function parseValue(c: Cursor): Parsed | undefined {
  c.skipWhitespace()
  if (c.done) return NOTHING

  const ch = c.peek()!
  if (ch === '{') return parseObject(c)
  if (ch === '[') return parseArray(c)
  if (ch === '"') return parseString(c)
  if (ch === 't') return parseLiteral(c, 'true', true)
  if (ch === 'f') return parseLiteral(c, 'false', false)
  if (ch === 'n') return parseLiteral(c, 'null', null)
  return parseNumber(c)
}

function parseObject(c: Cursor): Parsed {
  c.i++ // '{'
  const obj: Record<string, unknown> = {}

  for (;;) {
    c.skipWhitespace()
    if (c.done) return { value: obj, complete: false }

    const ch = c.peek()!
    if (ch === '}') {
      c.i++
      return { value: obj, complete: true }
    }
    // Separators are consumed wherever they appear rather than tracked as
    // state. A malformed document is not worth diagnosing — it is a stream
    // caught mid-write, and the next chunk fixes it.
    if (ch === ',' || ch === ':') {
      c.i++
      continue
    }
    if (ch !== '"') return { value: obj, complete: false }

    const key = parseString(c)
    // A half-written key is a member that has not started as far as anyone
    // downstream is concerned.
    if (!key?.complete) return { value: obj, complete: false }

    c.skipWhitespace()
    if (c.peek() !== ':') return { value: obj, complete: false }
    c.i++

    const value = parseValue(c)
    if (!value) return { value: obj, complete: false }

    obj[key.value as string] = value.value
    // The member is attached even when it is a container still filling up —
    // that partial child is the whole point — but nothing after it can exist.
    if (!value.complete) return { value: obj, complete: false }
  }
}

function parseArray(c: Cursor): Parsed {
  c.i++ // '['
  const arr: unknown[] = []

  for (;;) {
    c.skipWhitespace()
    if (c.done) return { value: arr, complete: false }

    const ch = c.peek()!
    if (ch === ']') {
      c.i++
      return { value: arr, complete: true }
    }
    if (ch === ',') {
      c.i++
      continue
    }

    const value = parseValue(c)
    if (!value) return { value: arr, complete: false }

    arr.push(value.value)
    if (!value.complete) return { value: arr, complete: false }
  }
}

/**
 * A string, only if it is closed.
 *
 * Handing over the prefix of an unterminated string would mean text that
 * rewrites itself as it arrives, which reads as the system correcting itself
 * rather than working.
 */
function parseString(c: Cursor): Parsed | undefined {
  const start = c.i
  c.i++ // opening quote

  while (c.i < c.s.length) {
    const ch = c.s[c.i]!
    if (ch === '\\') {
      c.i += 2
      continue
    }
    c.i++
    if (ch === '"') {
      try {
        return { value: JSON.parse(c.s.slice(start, c.i)) as string, complete: true }
      } catch {
        // Unreachable from valid JSON — a closing quote can only land inside a
        // truncated escape (`"a\u00"`) if the producer emitted broken output.
        // Returning nothing keeps this total rather than throwing at the kiosk.
        return NOTHING
      }
    }
  }
  return NOTHING
}

function parseLiteral(c: Cursor, word: string, value: unknown): Parsed | undefined {
  if (c.s.startsWith(word, c.i)) {
    c.i += word.length
    return { value, complete: true }
  }
  return NOTHING
}

/**
 * A number, only if something after it proves it has ended.
 *
 * `3` at the end of the buffer is not yet a number — the next chunk may make
 * it `31`, or `3.5`. A delimiter (or any non-numeric character) settles it.
 */
function parseNumber(c: Cursor): Parsed | undefined {
  const start = c.i
  while (c.i < c.s.length && '-+.eE0123456789'.includes(c.s[c.i]!)) c.i++

  if (c.i === start || c.done) {
    c.i = start
    return NOTHING
  }
  const value = Number(c.s.slice(start, c.i))
  if (Number.isNaN(value)) {
    c.i = start
    return NOTHING
  }
  return { value, complete: true }
}

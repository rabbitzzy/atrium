/**
 * What a Card's QR code says, and how to read it back (BHCS-37).
 *
 * The printer writes this and the station reads it, which is the whole round
 * trip: a page comes back off the desk and the system knows whose it is and
 * which task it was without asking the child to type anything or a teacher to
 * sort a pile.
 *
 * A helper package because both ends need the same answer and neither should
 * own it. `worksheet-print` is a service and `kiosk` is the platform; if the
 * format lived in either, the other would be reimplementing it from a comment.
 * Pure — no I/O, no image decoding, no React. Handed a string, it tells you
 * whether that string is a Card and whose.
 *
 * ── Why it is versioned ──
 *
 * The old payload was `JSON.stringify({ studentId, taskId })`, which is only a
 * format by accident: any JSON object with those two keys parses as a Card, and
 * a future change to what a Card carries would be undetectable — an old sheet
 * pulled out of a drawer in March would decode as a new one and quietly attach
 * a child's work to the wrong shape of task.
 *
 * `v` makes both cases decidable. An unknown version is refused rather than
 * guessed at, because attaching a scan to the wrong task is worse than asking
 * the student to try again.
 *
 * ── Why it stays small ──
 *
 * A QR printed at 22mm has to survive being photographed by a webcam at a
 * distance, sometimes out of focus (the open P0 in the roadmap). Every
 * character raises the module count and shrinks the modules. So the payload
 * carries the two ids and nothing else: everything else about the task is one
 * lookup away, and a lookup is free while a misread is not.
 */

/** Bump when the shape changes. Old Cards then refuse rather than mislead. */
export const CARD_QR_VERSION = 1

export interface CardQr {
  v: number
  /** BHCS portal student id. */
  s: string
  /** `tasks.id` — a uuid. */
  t: string
}

export interface CardIdentity {
  studentId: string
  taskId: string
}

/**
 * Short keys on purpose. `{"v":1,"s":"abc","t":"…"}` against
 * `{"version":1,"studentId":"abc","taskId":"…"}` is about thirty characters
 * saved on a payload of roughly seventy — which is the difference between a
 * QR that reads from a phone-height webcam and one that does not.
 */
export function encodeCardQr(identity: CardIdentity): string {
  if (!identity.studentId) throw new Error('a Card QR needs a studentId')
  if (!identity.taskId) throw new Error('a Card QR needs a taskId')
  const payload: CardQr = {
    v: CARD_QR_VERSION,
    s: identity.studentId,
    t: identity.taskId,
  }
  return JSON.stringify(payload)
}

export type DecodeFailure =
  | 'not-json'
  | 'not-a-card'
  | 'unsupported-version'
  | 'missing-fields'

export type DecodeResult =
  | { ok: true; identity: CardIdentity }
  | { ok: false; reason: DecodeFailure }

/**
 * Read a QR's text back into an identity, or say why not.
 *
 * Returns a reason rather than throwing or returning null, because the caller
 * has to tell a seven-year-old something. "This does not look like one of our
 * Cards" and "this Card is from an older version of the station" are different
 * sentences, and only one of them means fetch a teacher.
 */
export function decodeCardQr(text: string | null | undefined): DecodeResult {
  if (!text) return { ok: false, reason: 'not-a-card' }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'not-json' }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'not-a-card' }
  }

  const p = parsed as Partial<CardQr>
  if (typeof p.v !== 'number') return { ok: false, reason: 'not-a-card' }
  if (p.v !== CARD_QR_VERSION) return { ok: false, reason: 'unsupported-version' }
  if (typeof p.s !== 'string' || typeof p.t !== 'string' || !p.s || !p.t) {
    return { ok: false, reason: 'missing-fields' }
  }

  return { ok: true, identity: { studentId: p.s, taskId: p.t } }
}

/**
 * What to say to the person holding the page.
 *
 * Lives here rather than in the kiosk because the reasons and the sentences
 * have to stay in step, and a reason with no sentence is how a child ends up
 * looking at an error code.
 */
export const DECODE_MESSAGE: Record<DecodeFailure, { en: string; zh: string }> = {
  'not-json': {
    en: "That code isn't one of ours — is this an Atrium Card?",
    zh: '这个二维码不是我们的，这是 Atrium 的练习卡吗？',
  },
  'not-a-card': {
    en: "I couldn't find a Card code on this page. Try laying it flat with the corners showing.",
    zh: '这一页上没找到练习卡的二维码。把它放平，让四个角都露出来试试。',
  },
  'unsupported-version': {
    en: 'This Card is from an older version of the station. Ask a teacher for a fresh one.',
    zh: '这张卡是旧版本的，请让老师帮你打印一张新的。',
  },
  'missing-fields': {
    en: "This Card's code is damaged. Ask a teacher for a fresh one.",
    zh: '这张卡的二维码损坏了，请让老师帮你打印一张新的。',
  },
}

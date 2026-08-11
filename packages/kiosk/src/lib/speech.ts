/**
 * The station's voice (BHCS-15).
 *
 * A Debrief is written to a child who has just handed over their work, and for
 * the youngest students it is written in the one medium they cannot use. The
 * system diagnoses exactly what a five-year-old needs to hear and then puts it
 * on a screen in sentences they cannot read. Read-aloud closes that, and it is
 * what makes the digital-first Debrief in `docs/pedagogy/eco-design.md` true
 * for TK–2 rather than true only for the students who can already read.
 *
 * ── Why this is not the deferred Phase 3 voice ──────────────────────────────
 *
 * Voice is deferred to Phase 3 in five places, and the stated reason is the
 * microphone: children's voices recorded in a shared room is a real privacy
 * problem (Merlyn Mind), and it deserves its own phase. None of that applies
 * here. This is output only — a speaker and some text. No recording, no
 * retention, no consent surface, nothing captured at all.
 *
 * ── Why the browser's own synthesiser ───────────────────────────────────────
 *
 * ElevenLabs or OpenAI TTS would give a warmer Docent, and cost a key, a
 * server route, an audio cache per Debrief, and a wait before the first word.
 * `speechSynthesis` is already on the Chromebox, needs no network round trip of
 * ours, costs nothing per play, and replays instantly — which deletes the
 * "cache the audio so replay is free" step from the ticket rather than
 * implementing it.
 *
 * The seam is drawn so that changing this later is a change to this file: apps
 * hand over `SpokenScript` (words), the platform decides voice and pace, and
 * `ReadAloud` only knows `speak` / `stopSpeaking`.
 *
 * ── The shared room ─────────────────────────────────────────────────────────
 *
 * Text on a monitor is private-ish; audio is not. "Let's look at borrowing
 * again" played out loud tells everyone within earshot how that student did,
 * and the students who most need read-aloud are the youngest and least able to
 * shrug that off. Nothing in software solves that — headphones or a near-field
 * speaker at low volume does. What software owes it is the part that is right
 * under either answer, and it is enforced here rather than left to each caller:
 * **speech only ever starts from a press.** There is no autoplay path in this
 * module, and a kiosk that starts talking on its own in a quiet room is its own
 * problem regardless of what it says.
 */

export type SpeechLang = 'en' | 'zh'

/** What we ask for when no installed voice names itself more specifically. */
const BCP47: Record<SpeechLang, string> = { en: 'en-US', zh: 'zh-CN' }

/**
 * The Docent, as far as a system voice can be chosen.
 *
 * `docs/brand/naming-rationale.md` describes a guide who "walks beside you,
 * reads your pace" — close range and unhurried, not an announcer. Two knobs
 * carry that here.
 *
 * Pace is below 1 in both languages and lower in Chinese, because these are
 * heritage learners whose Chinese reading sits a band under their English
 * (`app-worksheet/src/reading-level.ts` builds the whole prompt around that
 * gap) and a synthesiser at full speed is the listening equivalent of the
 * sentence being too long.
 *
 * Pitch stays at 1 deliberately. Raising it is how a voice starts sounding
 * like a cartoon, and babying a child is a form of the shaming this Debrief is
 * written to avoid — the same reason the tier labels are warm without being
 * cute.
 */
const PACE: Record<SpeechLang, number> = { en: 0.92, zh: 0.88 }
const DOCENT_PITCH = 1

/** How much slower for a reader who is still assembling words from letters. */
const EMERGING_SLOWDOWN = 0.1

/**
 * Voices worth having on purpose, best first, matched loosely by name.
 *
 * The installed set varies by machine, and the gap between the best and worst
 * on the same machine is the gap between a voice a child listens to and one
 * they walk away from. Nothing here is required: an unrecognised name still
 * wins on language alone, which is what keeps this working on a laptop nobody
 * tested on.
 */
const PREFERRED: Record<SpeechLang, readonly string[]> = {
  en: ['google us english', 'samantha', 'microsoft aria', 'microsoft jenny'],
  zh: ['google 普通话', 'tingting', 'ting-ting', 'microsoft xiaoxiao', 'microsoft yaoyao'],
}

/**
 * At most this many characters per utterance.
 *
 * Not a style rule — Chrome stops speaking part-way through a long single
 * utterance (the ~15-second cutoff), and a Debrief that dies mid-sentence in
 * front of a child who cannot read the rest is the exact failure this feature
 * exists to prevent. Short utterances also make stopping instant.
 */
const MAX_CHARS = 160

/** How long to wait for the voice list before deciding there is not one. */
const VOICES_TIMEOUT_MS = 1500

export function speechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  )
}

/**
 * Score a voice for a language. 0 means "do not use this one at all".
 *
 * Exported for the test rather than for callers: the ranking is the part of
 * voice selection that has actual judgement in it, and it is judgement about
 * strings, so it can be checked without a browser.
 */
export function voiceScore(voice: { name: string; lang: string }, lang: SpeechLang): number {
  const tag = voice.lang.replace('_', '-').toLowerCase()
  if (!tag.startsWith(lang)) return 0
  /*
   * Cantonese is excluded rather than ranked low. `summary_zh` is written in
   * Mandarin, and a Cantonese voice reading it is not an accent — it is a
   * different spoken language over the same characters, which for a Mandarin
   * heritage learner is less use than silence.
   */
  if (lang === 'zh' && (tag.startsWith('zh-hk') || tag.startsWith('zh-yue'))) return 0

  let score = 1
  if (tag === BCP47[lang].toLowerCase()) score += 2
  const rank = PREFERRED[lang].findIndex((n) => voice.name.toLowerCase().includes(n))
  if (rank >= 0) score += PREFERRED[lang].length - rank + 2
  return score
}

export function pickVoice<V extends { name: string; lang: string }>(
  voices: readonly V[],
  lang: SpeechLang,
): V | null {
  let best: V | null = null
  let bestScore = 0
  for (const voice of voices) {
    const score = voiceScore(voice, lang)
    // Strictly greater, so the first voice at a given score wins — the browser
    // lists the platform default first, and it is a better tie-break than
    // whatever happens to be last.
    if (score > bestScore) {
      best = voice
      bestScore = score
    }
  }
  return best
}

/** How fast to speak to this student, in this language. */
export function paceFor(lang: SpeechLang, grade: number | null | undefined): number {
  const emerging = typeof grade === 'number' && Number.isFinite(grade) && grade <= 1
  return PACE[lang] - (emerging ? EMERGING_SLOWDOWN : 0)
}

/**
 * Sentence boundaries, in both languages, without cutting decimals.
 *
 * The lookahead for whitespace-or-end is what keeps "2.5" whole: a period that
 * ends a sentence is followed by a space or by nothing, a period inside a
 * number never is.
 */
const SENTENCE_END = /(?<=[.!?;。！？；])(?=\s|$)/

/**
 * Turn an app's lines into utterance-sized pieces.
 *
 * Packed rather than split one sentence per utterance: every utterance
 * boundary is an audible gap in Chrome, so a paragraph read as five utterances
 * sounds like five announcements. Sentences travel together until the cap
 * forces a break, which puts the gaps where a reader would have paused anyway.
 */
export function chunk(lines: readonly string[], max = MAX_CHARS): string[] {
  const out: string[] = []
  let buffer = ''

  // Packing runs across lines, not within them: the app's line breaks are
  // where one thing it wanted said ends, which is a sentence boundary and
  // nothing more. Treating each as its own utterance would put a gap after
  // every one of them.
  for (const line of lines) {
    for (const sentence of line.trim().split(SENTENCE_END)) {
      for (const part of hardSplit(sentence.trim(), max)) {
        if (!part) continue
        if (buffer && buffer.length + part.length + 1 > max) {
          out.push(buffer)
          buffer = ''
        }
        buffer = buffer ? `${buffer} ${part}` : part
      }
    }
  }
  if (buffer) out.push(buffer)

  return out
}

/**
 * Break a single over-long sentence, preferring a comma and settling for a
 * blind cut.
 *
 * The blind cut is not hypothetical: Chinese runs without spaces, so a long
 * `summary_zh` with no internal punctuation has no natural break at all. A
 * seam mid-phrase is worse than one at a comma and far better than an
 * utterance that stops speaking half way through.
 */
function hardSplit(sentence: string, max: number): string[] {
  if (sentence.length <= max) return [sentence]

  const out: string[] = []
  let rest = sentence
  while (rest.length > max) {
    const window = rest.slice(0, max)
    const seam = Math.max(
      window.lastIndexOf(' '),
      window.lastIndexOf('，'),
      window.lastIndexOf(','),
      window.lastIndexOf('、'),
    )
    // Only honour a seam in the back half; one at character 3 of 160 would
    // shave a word off and leave the same problem for the next pass.
    const at = seam > max / 2 ? seam + 1 : max
    out.push(rest.slice(0, at).trim())
    rest = rest.slice(at).trim()
  }
  if (rest) out.push(rest)
  return out
}

/**
 * The voice list, which Chrome populates asynchronously and sometimes not at
 * all.
 *
 * `getVoices()` returns an empty array on the first call after a cold load and
 * fills in later via `voiceschanged`. On a platform that has no voices the
 * event never fires, so the wait is bounded: an empty list after the timeout is
 * a real answer — no read-aloud on this machine — and `ReadAloud` shows no
 * button rather than one that does nothing.
 */
export async function loadVoices(timeoutMs = VOICES_TIMEOUT_MS): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return []

  const synth = window.speechSynthesis
  const now = synth.getVoices()
  if (now.length > 0) return now

  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      synth.removeEventListener('voiceschanged', finish)
      resolve(synth.getVoices())
    }
    const timer = setTimeout(finish, timeoutMs)
    synth.addEventListener('voiceschanged', finish)
  })
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel()
}

/**
 * Whether the reading finished or was cut short. Both are ordinary — a student
 * pressing stop is not an error, and neither is pressing the other language.
 */
export type SpeechOutcome = 'done' | 'stopped'

interface SpeakOptions {
  /** Pace only. Nothing about the student reaches the words themselves. */
  grade?: number | null
  /** Which chunk is being spoken, for callers that want to show progress. */
  onProgress?: (index: number, total: number) => void
}

/**
 * Chrome garbage-collects utterances that are still speaking if nothing holds
 * them, which truncates audio at unpredictable points. Holding a reference for
 * the duration is the standard workaround and costs one small object.
 */
const inFlight = new Set<SpeechSynthesisUtterance>()

/**
 * Say these lines, in this language, now.
 *
 * Resolves when the last word lands, or the moment something interrupts —
 * which is how the caller's button gets back to its resting state without
 * polling `speechSynthesis.speaking`.
 */
export async function speak(
  lines: readonly string[],
  lang: SpeechLang,
  { grade = null, onProgress }: SpeakOptions = {},
): Promise<SpeechOutcome> {
  if (!speechSupported()) return 'stopped'

  const parts = chunk(lines)
  if (parts.length === 0) return 'done'

  const voice = pickVoice(await loadVoices(), lang)
  const rate = paceFor(lang, grade)

  // One voice at a time. Pressing 中文 while the English is still going is a
  // student changing their mind, not a request for both at once.
  window.speechSynthesis.cancel()

  for (let i = 0; i < parts.length; i++) {
    onProgress?.(i, parts.length)
    if ((await utter(parts[i]!, voice, lang, rate)) === 'stopped') return 'stopped'
  }
  return 'done'
}

function utter(
  text: string,
  voice: SpeechSynthesisVoice | null,
  lang: SpeechLang,
  rate: number,
): Promise<SpeechOutcome> {
  return new Promise((resolve) => {
    const u = new window.SpeechSynthesisUtterance(text)
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? BCP47[lang]
    u.rate = rate
    u.pitch = DOCENT_PITCH

    const settle = (outcome: SpeechOutcome) => {
      inFlight.delete(u)
      resolve(outcome)
    }
    u.onend = () => settle('done')
    /*
     * A cancelled utterance reports an error, and it is not one. Anything else
     * — a voice that failed to load, audio hardware that is not there —
     * settles as 'done' so the remaining chunks still get their turn: a
     * synthesiser that chokes on one sentence should not swallow the rest of
     * a child's Debrief.
     */
    u.onerror = (e) => settle(e.error === 'interrupted' || e.error === 'canceled' ? 'stopped' : 'done')

    inFlight.add(u)
    window.speechSynthesis.speak(u)
  })
}

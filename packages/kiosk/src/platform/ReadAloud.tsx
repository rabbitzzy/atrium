/**
 * "Read it to me" — the button a child who cannot read the Debrief presses
 * (BHCS-15).
 *
 * The platform half of read-aloud. The app said what there is to say; this
 * decides when it is said, which is: only when a student asks, one language at
 * a time, and never twice at once. See `lib/speech.ts` for why the station has
 * a voice at all and why it is the browser's.
 *
 * ── One button per language ─────────────────────────────────────────────────
 *
 * Every evaluation carries both `summary_en` and `summary_zh`, so read-aloud
 * has to choose or offer both, and offering both is the honest answer. It is
 * also a small piece of real bilingual support rather than an accessibility
 * afterthought: hearing the Chinese read correctly is worth something to a
 * heritage learner who can follow it by ear long before they can read it.
 *
 * Each button is labelled in the language it will speak. A child who cannot
 * read either one can still tell them apart by the shape of the characters,
 * which is the same reasoning behind the emoji on the capture buttons.
 *
 * ── Nothing here plays on its own ───────────────────────────────────────────
 *
 * No autoplay, no "speak the result when it arrives", not even for the
 * youngest students. Audio in a shared room is public in a way a monitor is
 * not, and a machine that announces a child's Debrief to everyone within
 * earshot has taken a decision that belongs to the child. The press is the
 * consent, and it is the only way this component ever makes a sound.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { SpokenScript, Student } from '@atrium/schema'
import { loadVoices, pickVoice, speak, speechSupported, stopSpeaking, type SpeechLang } from '../lib/speech'
import type { AnyCaptureApp } from './registry'

interface Props {
  script: SpokenScript
  /** For pace only — the youngest readers are read to more slowly. */
  grade: number | null
}

/**
 * An app's result, offered out loud — the form both result screens use.
 *
 * The platform's whole part in deciding *what* is said: ask the app that
 * produced the payload, and draw nothing if it has no answer. It never looks
 * inside `ocr`, exactly as it never does anywhere else.
 */
export function SpokenDebrief({
  app,
  ocr,
  student,
}: {
  app: AnyCaptureApp
  ocr: unknown
  student: Student
}) {
  // Built once per result rather than per render, for the same reason
  // `waitChat` is: `ReadAloud` holds this, and a new object identity on every
  // render is a new script under a reading already in progress.
  const script = useMemo(() => app.speech?.(ocr, { student }) ?? null, [app, ocr, student])
  if (!script) return null
  return <ReadAloud script={script} grade={student.grade ?? null} />
}

const LABEL: Record<SpeechLang, { idle: string; busy: string }> = {
  en: { idle: '🔊 Read it to me', busy: '⏹ Stop' },
  zh: { idle: '🔊 读给我听', busy: '⏹ 停一下' },
}

export default function ReadAloud({ script, grade }: Props) {
  /**
   * Which languages this machine can actually speak, resolved once the voice
   * list arrives. `null` means "still finding out" and renders nothing — a
   * button that appears a second late is better than one that appears at once
   * and turns out to be silent.
   */
  const [available, setAvailable] = useState<SpeechLang[] | null>(null)
  const [speaking, setSpeaking] = useState<SpeechLang | null>(null)
  /**
   * Which press is current. A student who presses English, then Chinese, gets
   * two `speak` calls in flight; the first resolves as 'stopped' shortly after
   * the second starts, and without this its cleanup would clear the button
   * state belonging to the reading that is still going.
   */
  const pressSeq = useRef(0)

  useEffect(() => {
    if (!speechSupported()) {
      setAvailable([])
      return
    }
    let live = true
    void loadVoices().then((voices) => {
      if (!live) return
      setAvailable((['en', 'zh'] as const).filter((lang) => pickVoice(voices, lang) !== null))
    })
    return () => {
      live = false
    }
  }, [])

  /*
   * Silence on the way out, always. The student pressed play on a Debrief and
   * then walked to the camera to capture the next page; the voice reading the
   * old one over the new screen belongs to a session that is over.
   */
  useEffect(() => () => stopSpeaking(), [])

  const langs = (available ?? []).filter((lang) => script[lang].length > 0)
  // Nothing to say, or nothing to say it with. Either way there is no control
  // worth drawing — this is the machine with no voices installed, or a result
  // whose app has no spoken form for it.
  if (langs.length === 0) return null

  async function toggle(lang: SpeechLang) {
    // The same button again means stop. It is the one gesture a five-year-old
    // reliably tries first, and it is also the only way to interrupt a reading
    // they did not mean to start.
    if (speaking === lang) {
      stopSpeaking()
      setSpeaking(null)
      return
    }

    const seq = ++pressSeq.current
    setSpeaking(lang)
    await speak(script[lang], lang, { grade })
    if (seq === pressSeq.current) setSpeaking(null)
  }

  return (
    <div style={row}>
      <style>{`
        @keyframes read-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
        .read-btn { transition: transform 120ms ease, box-shadow 120ms ease; }
        .read-btn:hover { transform: translateY(-2px); }
        .read-btn:active { transform: translateY(1px); }
        .read-btn[data-speaking="true"] { animation: read-pulse 1.4s ease-in-out infinite; }
      `}</style>

      {langs.map((lang) => (
        <button
          key={lang}
          onClick={() => void toggle(lang)}
          className="read-btn"
          data-speaking={speaking === lang}
          style={{
            ...btn,
            background: speaking === lang ? '#1a1a2e' : '#f0ede8',
            color: speaking === lang ? '#fff' : '#1a1a2e',
            borderColor: speaking === lang ? '#1a1a2e' : '#d0cdc8',
          }}
        >
          {speaking === lang ? LABEL[lang].busy : LABEL[lang].idle}
        </button>
      ))}
    </div>
  )
}

const row: React.CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap' }

/*
 * Sized as a real control rather than a link. This is the primary way in for
 * the students who cannot use the screen at all, so it is not allowed to be
 * the smallest thing on it.
 */
const btn: React.CSSProperties = {
  padding: '12px 20px',
  fontSize: 16,
  fontWeight: 600,
  fontFamily: 'DM Sans, sans-serif',
  borderRadius: 12,
  border: '2px solid',
  cursor: 'pointer',
}

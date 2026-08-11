/**
 * The station noticing that the person it is talking to has left (BHCS-18).
 *
 * Nobody checks out. That is not a training problem to be solved with a bigger
 * button — a seven-year-old who has finished their work and is holding it is
 * already walking, and the last screen of a visit is the one screen they are
 * guaranteed not to read. So the way a visit ends cannot depend on the student
 * ending it.
 *
 * What it depends on instead is silence, and the rules for reading silence are
 * in `lib/presence.ts`. This file is the plumbing around them: what counts as
 * someone being there, and what the station says before it lets a visit go.
 *
 * ── Why it asks rather than just resetting ──────────────────────────────────
 *
 * The failure mode of a silent timeout is the worst one available here: a child
 * three paragraphs into their Debrief looks up at the welcome screen and has to
 * find their own name again to get back to a page they were reading. A card
 * with their name on it and one large "Yes, it's me" costs that child a tap and
 * costs the empty station 45 seconds — the right way round.
 *
 * ── Why it offers "someone else" too ────────────────────────────────────────
 *
 * The card is also the most likely thing the *next* child sees. If it only
 * offered "yes, it's me", the honest answer for them would be no answer at all
 * — stand and wait for a countdown. So the question is asked with both answers
 * attached, and the second one is the one that puts a new name on the station.
 */

import { useEffect, useRef, useState } from 'react'
import type { Student } from '@atrium/schema'
import { presenceAfter, type Presence } from '../lib/presence'
import { stopSpeaking } from '../lib/speech'

/**
 * Everything that means a person is present.
 *
 * `wheel`, `touchmove` and `scroll` are on this list for one specific student:
 * the one with a ten-question Debrief, who spends four minutes scrolling
 * through it and pressing nothing. Reading is the activity this station exists
 * to produce, and a timer that cannot see it would end exactly the visits it
 * should protect. `scroll` is listened for in the capture phase because it does
 * not bubble from a scrolling element.
 */
const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'touchmove'] as const

/** How often the clock is read. One second, because the card counts in seconds. */
const TICK_MS = 1000

/**
 * Track how long the station has gone untouched.
 *
 * Activity only writes a ref — a kiosk should not re-render on every mousemove
 * of a child fidgeting with the trackpad — and the ticker is what turns that
 * into state, once a second. The exception is `bump`, returned for the buttons
 * on the card, which has to clear the screen the instant it is pressed rather
 * than up to a second later.
 */
function usePresence(): { presence: Presence; bump: () => void } {
  const lastActive = useRef(Date.now())
  const [presence, setPresence] = useState<Presence>({ state: 'here' })
  /*
   * Whether the question is currently on screen, readable from the event
   * listener without re-registering it every second.
   *
   * Once it is up, ambient activity stops counting: a stray keystroke or a
   * scroll must not put the station back into the previous child's session,
   * because "somebody is touching this" is exactly the fact that is not in
   * doubt. The question is *who*, and only the two buttons answer it.
   */
  const asking = useRef(false)
  asking.current = presence.state === 'asking'

  useEffect(() => {
    const seen = () => {
      if (asking.current) return
      lastActive.current = Date.now()
    }
    for (const type of ACTIVITY) window.addEventListener(type, seen, { passive: true })
    window.addEventListener('scroll', seen, { capture: true, passive: true })

    const timer = setInterval(() => {
      const next = presenceAfter(Date.now() - lastActive.current)
      // Same state, same second: skip the render. While someone is working
      // this is every tick, which is the common case by a wide margin.
      setPresence((prev) => (sameState(prev, next) ? prev : next))
    }, TICK_MS)

    return () => {
      for (const type of ACTIVITY) window.removeEventListener(type, seen)
      window.removeEventListener('scroll', seen, { capture: true })
      clearInterval(timer)
    }
  }, [])

  return {
    presence,
    bump: () => {
      lastActive.current = Date.now()
      setPresence({ state: 'here' })
    },
  }
}

const sameState = (a: Presence, b: Presence): boolean =>
  a.state === b.state &&
  (a.state !== 'asking' || b.state !== 'asking' || a.secondsLeft === b.secondsLeft)

export default function StillHere({
  student,
  onLeave,
}: {
  student: Student
  onLeave: () => void
}) {
  const { presence, bump } = usePresence()
  const gone = presence.state === 'gone'

  useEffect(() => {
    if (!gone) return
    // Whatever the Docent was in the middle of saying was said to somebody who
    // is not here. A station reading a Debrief aloud to an empty room, over the
    // welcome screen, is the one thing more confusing than saying nothing.
    stopSpeaking()
    onLeave()
  }, [gone, onLeave])

  if (presence.state !== 'asking') return null

  return (
    <div style={scrim} role="dialog" aria-modal="true" aria-label="Still here?">
      <div style={card}>
        <div style={{ fontSize: 52, lineHeight: 1 }}>👋</div>
        <div>
          <div style={{ fontSize: 30, fontWeight: 700, color: '#1a1a2e' }}>Still here?</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#666', marginTop: 4 }}>还在吗？</div>
        </div>

        {/*
          The name is the largest thing on the card, and it is the question. A
          child arriving at a station mid-countdown is not being asked whether
          they are present — they obviously are — they are being asked whether
          they are Mia.
        */}
        <div style={nameChip}>
          {student.name}
          {student.nameZh && <span style={{ color: '#666', fontWeight: 600 }}> {student.nameZh}</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
          <button onClick={bump} style={stayBtn}>Yes, it’s me 是我</button>
          <button onClick={onLeave} style={switchBtn}>Someone else 换人</button>
        </div>

        <p style={{ margin: 0, fontSize: 15, color: '#999' }}>
          Starting over in {presence.secondsLeft}s · {presence.secondsLeft} 秒后回到首页
        </p>
      </div>
    </div>
  )
}

/**
 * The name at the top of every screen, and the way off it (BHCS-18).
 *
 * This replaced a 14px grey name sitting beside a 14px grey "Check out" — two
 * controls' worth of screen spent on the child who is leaving, in a size no
 * child reads. One control now, and its label is written for the child
 * arriving: their own name is the thing they check, and "Not Mia?" is a
 * question they can answer without being able to read the word "check-out".
 */
export function WhoChip({ student, onSwitch }: { student: Student; onSwitch: () => void }) {
  return (
    <button onClick={onSwitch} style={whoChip} aria-label={`Working as ${student.name}. Tap to switch student.`}>
      <span style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e', lineHeight: 1.2 }}>
        👋 {student.name}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#7a8f84' }}>
        Not {firstName(student)}? 换人
      </span>
    </button>
  )
}

/**
 * The same question, said once more where it actually matters.
 *
 * The header chip is on every screen; this is on exactly one, directly above
 * the three shutter buttons. Pressing one of those is the instant a capture
 * acquires a `student_id`, and a name in the top-right corner is not where
 * anyone is looking at that instant — they are looking at the page they just
 * laid down and the button they are about to press. So the sentence sits
 * between the two.
 */
export function SavingAs({ student, onSwitch }: { student: Student; onSwitch: () => void }) {
  return (
    <button onClick={onSwitch} style={savingAs}>
      Saving as <strong style={{ color: '#1a1a2e' }}>{student.name}</strong>
      {student.nameZh ? ` ${student.nameZh}` : ''} · Not you? Tap here 不是你？点这里
    </button>
  )
}

/** What a child is called. "Not Zhenyan Zhu?" is a form field; "Not Mia?" is a question. */
const firstName = (s: Student): string => s.name.trim().split(/\s+/)[0] ?? s.name

// ── Styles ───────────────────────────────────────────────────────────────────

const scrim: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(26,26,46,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }
const card: React.CSSProperties = { background: '#fff', borderRadius: 24, padding: '32px 28px', width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.28)', fontFamily: 'DM Sans, sans-serif' }
const nameChip: React.CSSProperties = { padding: '10px 22px', borderRadius: 999, background: '#f0ede8', fontSize: 24, fontWeight: 700, color: '#1a1a2e', maxWidth: '100%', overflowWrap: 'anywhere' }
const stayBtn: React.CSSProperties = { padding: '18px 24px', fontSize: 19, fontWeight: 700, fontFamily: 'DM Sans, sans-serif', borderRadius: 14, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer', width: '100%' }
const switchBtn: React.CSSProperties = { padding: '16px 24px', fontSize: 17, fontWeight: 700, fontFamily: 'DM Sans, sans-serif', borderRadius: 14, border: '2px solid #d0cdc8', background: '#fff', color: '#1a1a2e', cursor: 'pointer', width: '100%' }
const whoChip: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '8px 16px', borderRadius: 12, border: '2px solid #d8e2db', background: '#f4f8f5', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textAlign: 'left', maxWidth: 240 }
const savingAs: React.CSSProperties = { alignSelf: 'center', padding: '8px 18px', borderRadius: 999, border: '1px solid #e0ddd8', background: '#faf9f7', color: '#7a7a7a', fontSize: 14, fontFamily: 'DM Sans, sans-serif', cursor: 'pointer' }

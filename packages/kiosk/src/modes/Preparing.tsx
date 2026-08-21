/**
 * The screen that holds a child still while a Card is made.
 *
 * Two jobs, and they are the same job. It fills twenty to thirty seconds of
 * network silence with something that is visibly happening, and it covers every
 * other control on the station so that the child who gets bored anyway cannot
 * start a second thing on top of the first.
 *
 * ── Why a cover and not disabled buttons ──
 *
 * The four doors used to go `disabled` and everything else stayed live: My
 * work, What I know, the name chip. Pressing any of those mid-generation takes
 * a child away from the wait they are in the middle of, and the Card lands on a
 * screen they are no longer looking at. Worse, the name chip ends the visit
 * outright — the request keeps running, spends the Leaf, and prints a page for
 * a student the station has already forgotten.
 *
 * So it is one fixed layer over the whole station. Nothing behind it can be
 * pressed, because nothing behind it is reachable.
 *
 * ── Why it is a conversation ──
 *
 * See `lib/preparing.ts`. No percentage and no progress bar: the durations are
 * honest guesses, and a bar that fills to 90% and stops is a worse lie than no
 * bar at all. Lines arrive one at a time and scroll up, so the screen is moving
 * even when the network is not, and the tail repeats so a long wait never looks
 * like a frozen one.
 */

import { useEffect, useRef, useState } from 'react'
import {
  prepareScript,
  linesShown,
  tailLine,
  PREPARING_BEAT_MS,
  type PreparingLine,
} from '../lib/preparing'

/** Twice a beat: fast enough that a line never appears visibly late. */
const TICK_MS = Math.round(PREPARING_BEAT_MS / 2)

export default function Preparing({
  subject,
  simulate,
}: {
  /** The door they pressed, or undefined for the lucky pick. */
  subject?: string
  simulate: boolean
}) {
  const [script] = useState(() => prepareScript(subject, simulate))
  const started = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const bottom = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - started.current), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const shown = linesShown(script, elapsed)
  const tail = tailLine(script, elapsed)
  const lines: PreparingLine[] = tail ? [...shown, tail] : shown

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [lines.length])

  return (
    <div
      style={scrim}
      role="alertdialog"
      aria-busy="true"
      aria-label="Making your Card"
      // A child pressing the screen during the wait should not be able to reach
      // anything, and should not feel ignored either — the cover swallows the
      // press, and the script is already saying they do not need to press
      // anything.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Sprout />
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#1a1a2e' }}>
              Making your Card
            </div>
            <div style={{ fontSize: 19, fontWeight: 600, color: '#6b6a75' }}>正在做你的练习卡</div>
          </div>
        </div>

        <div style={transcript}>
          {lines.map((l, i) => {
            // Older lines fade rather than scroll away entirely: the child can
            // still see what the station said it was doing, which is what makes
            // the last line believable.
            const age = lines.length - 1 - i
            return (
              <div key={`${l.at}-${i}`} style={{ ...row, opacity: age === 0 ? 1 : Math.max(0.28, 1 - age * 0.16) }}>
                <span style={{ fontSize: age === 0 ? 18 : 16, fontWeight: age === 0 ? 700 : 600, color: '#1a1a2e' }}>
                  {l.en}
                </span>
                <span style={{ fontSize: age === 0 ? 16 : 14.5, color: '#5a5a6a' }}>{l.zh}</span>
              </div>
            )
          })}
          <div ref={bottom} />
        </div>

        <div style={foot}>
          {simulate
            ? 'No paper is being used. 不会用纸。'
            : 'Wait here — your Card is coming. 在这里等一下，练习卡马上来。'}
        </div>
      </div>
    </div>
  )
}

/**
 * A growing sprout rather than a spinner.
 *
 * A spinner is the universal sign of a thing that might never finish, and it is
 * the same shape whether the wait is a second or a minute. This is the Leaf the
 * Card cost, drawn as something growing, and it is the station's own vocabulary.
 */
function Sprout() {
  return (
    <div style={{ position: 'relative', width: 46, height: 46, flex: 'none' }} aria-hidden>
      <style>{`
        @keyframes atrium-sway { 0%,100% { transform: rotate(-7deg) } 50% { transform: rotate(7deg) } }
        @keyframes atrium-pulse { 0%,100% { opacity: 0.25; transform: scale(0.86) } 50% { opacity: 0.5; transform: scale(1) } }
        @media (prefers-reduced-motion: reduce) {
          .atrium-sprout, .atrium-halo { animation: none !important }
        }
      `}</style>
      <div
        className="atrium-halo"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: '#4a7c59',
          animation: 'atrium-pulse 2.4s ease-in-out infinite',
        }}
      />
      <div
        className="atrium-sprout"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          fontSize: 26,
          transformOrigin: '50% 90%',
          animation: 'atrium-sway 2.4s ease-in-out infinite',
        }}
      >
        🌱
      </div>
    </div>
  )
}

const scrim: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  // Under the "Still here?" card, which is at 50 — though while this is up the
  // idle clock is stopped (`lib/busy.ts`), so the two should never meet.
  zIndex: 40,
  background: 'rgba(26,26,46,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
}
const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 24,
  padding: '26px 28px 22px',
  width: '100%',
  maxWidth: 560,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
  fontFamily: 'DM Sans, sans-serif',
}
const transcript: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  maxHeight: 320,
  overflowY: 'auto',
  paddingRight: 4,
}
const row: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  transition: 'opacity 400ms ease',
}
const foot: React.CSSProperties = {
  fontSize: 14.5,
  color: '#6b6a75',
  borderTop: '1px solid #eeece7',
  paddingTop: 12,
}

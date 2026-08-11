/**
 * What the station says while a capture is being read.
 *
 * The wait is 5–20 seconds of nothing, in front of a child who has just handed
 * over their work and has no way of telling a slow machine from a broken one.
 * A spinner and a fixed caption answer that badly: it is the same caption at
 * second two and second eighteen, so it stops carrying information almost
 * immediately and the screen reads as frozen.
 *
 * So the wait is spent talking. Lines arrive one at a time and stay, which
 * turns the pause into a short conversation the student is at the end of
 * rather than a progress bar they are watching.
 *
 * ── What this is not ────────────────────────────────────────────────────────
 *
 * It is not a model, and no request is made for it. Every line is written in
 * advance by the app that owns the capture kind, picked here, and shown
 * locally — which is why it works with the network down and adds nothing to
 * the time it is covering.
 *
 * That constrains what a line may say, and the constraint is the honest part:
 * a line can say what the machine is doing, because that is known, and it can
 * greet a student by name, because that is known too. It can never say
 * anything about the page — no praise, no assessment, not even a hint of one.
 * The moment a child reads "nice work!" from a system that has not looked yet,
 * everything it says afterwards about their actual work is worth less. The
 * variety here is to make waiting bearable, never to imply a reading that has
 * not happened.
 */

import { useEffect, useMemo, useState } from 'react'
import type { WaitLine } from '@atrium/schema'

/** How long each line sits alone before the next one joins it. */
const LINE_INTERVAL_MS = 2600

/** At most this many bubbles, so a slow read never scrolls the result away. */
const MAX_BUBBLES = 4

/**
 * Pick `count` distinct lines from the pool, in a fresh order every time.
 *
 * The shuffle is the whole trick: a fixed order is recognisable by the third
 * visit and stops reading as conversation the moment a student can predict the
 * next sentence. Drawing without replacement matters for the same reason —
 * hearing the same line twice in one wait is worse than never hearing it.
 */
function draw(pool: readonly WaitLine[], count: number): WaitLine[] {
  const rest = [...pool]
  const picked: WaitLine[] = []
  while (picked.length < count && rest.length > 0) {
    picked.push(...rest.splice(Math.floor(Math.random() * rest.length), 1))
  }
  return picked
}

export default function WaitChat({ lines }: { lines: readonly WaitLine[] }) {
  // Drawn once per mount, and the component is mounted once per capture — so
  // the sequence is fixed for this wait (nothing reshuffles under a line the
  // student is mid-way through reading) and different for the next one.
  const script = useMemo(() => draw(lines, MAX_BUBBLES), [lines])
  const [shown, setShown] = useState(1)

  useEffect(() => {
    if (shown >= script.length) return
    const timer = setTimeout(() => setShown((n) => n + 1), LINE_INTERVAL_MS)
    return () => clearTimeout(timer)
  }, [shown, script.length])

  if (script.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 440, margin: '0 auto' }}>
      <style>{`
        @keyframes bubble-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes dot { 0%, 60%, 100% { opacity: 0.25; } 30% { opacity: 1; } }
        .wait-bubble { animation: bubble-in 260ms ease-out; }
        .wait-dot { animation: dot 1.2s infinite; }
      `}</style>

      {script.slice(0, shown).map((line, i) => (
        <div key={i} className="wait-bubble" style={bubble}>
          <div style={{ fontSize: 16, color: '#1a1a2e' }}>{line.en}</div>
          <div style={{ fontSize: 14, color: '#8a857e', marginTop: 3 }}>{line.zh}</div>
        </div>
      ))}

      {/*
        Three dots in a bubble of their own — the one piece of chat vocabulary
        every child already knows means "still talking", and the only honest
        thing left to show once the written lines run out.
      */}
      <div style={{ ...bubble, alignSelf: 'flex-start', display: 'flex', gap: 5, padding: '14px 16px' }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="wait-dot"
            style={{ ...dot, animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </div>
    </div>
  )
}

const bubble: React.CSSProperties = {
  alignSelf: 'flex-start',
  background: '#f0ede8',
  borderRadius: '18px 18px 18px 6px',
  padding: '12px 16px',
  textAlign: 'left',
}

const dot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#1a1a2e',
  display: 'inline-block',
}

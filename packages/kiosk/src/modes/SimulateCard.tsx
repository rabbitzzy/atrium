/**
 * The Card on screen, and marking it by hand (simulate mode).
 *
 * Exists so the flywheel can be exercised without paper. Every Visit that gets
 * rehearsed on real Cards costs a sheet, a Leaf and a print, and a pilot that
 * has to spend those to check a button is a pilot that gets tested less than it
 * should be.
 *
 * ── What is real here, and what is not ──
 *
 * Real: the planner picking a Room, the problems being written, the task being
 * registered, the Leaf being spent, the Leaf being earned back, the BKT update,
 * the Floor plan moving. All of it goes through the same endpoints a printed
 * Card does.
 *
 * Not real: the printer, the camera, and the model's grading. An adult supplies
 * the tiers the grader would have produced. That is the saving and also the
 * limit — simulate mode can tell you the loop works, and can never tell you
 * whether the grading is any good.
 *
 * ── Why every row it writes is marked ──
 *
 * It writes to the same tables as a child's real work. Without the flag, a
 * Floor plan would blend the two and the pilot could no longer answer the one
 * question it exists to answer. The teacher surface can clear them.
 */

import { useState } from 'react'
import type { Student } from '@atrium/schema'
import { spentLine } from '../lib/leaves'

const TIERS = [
  { id: 'mastered', label: 'Got it', zh: '会了', bg: '#e7f1eb', color: '#2f6a4f' },
  { id: 'shaky', label: 'Sort of', zh: '有点会', bg: '#fdf6e3', color: '#8a6d1f' },
  { id: 'needs-help', label: 'Stuck', zh: '不太会', bg: '#fdf0ec', color: '#a4522f' },
  { id: 'not-yet', label: 'Not yet', zh: '还不会', bg: '#f2f0ec', color: '#5a5a6a' },
] as const

/** The Card's own layout puts five questions on a page (BHCS-36). */
const QUESTIONS = [1, 2, 3, 4, 5]

export default function SimulateCard({
  student,
  taskId,
  html,
  leavesLeft,
  onDone,
}: {
  student: Student
  taskId: string
  html: string
  leavesLeft: number
  onDone: () => void
}) {
  const [marks, setMarks] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const marked = Object.keys(marks).length

  async function turnIn() {
    setBusy(true)
    try {
      const res = await fetch('/api/simulate-submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          studentId: student.id,
          taskId,
          marks: Object.entries(marks).map(([n, quality]) => ({ number: Number(n), quality })),
        }),
      })
      const body = (await res.json()) as { updates?: Array<{ before: number; after: number }> }
      if (!res.ok) throw new Error('submit failed')
      const u = body.updates?.[0]
      setResult(
        u
          ? `Recorded. Mastery moved ${u.before.toFixed(2)} → ${u.after.toFixed(2)}, and you earned a Leaf back.`
          : 'Recorded.',
      )
    } catch {
      setResult('Could not record that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={wrap}>
      <div style={banner}>
        Simulate mode — nothing printed. {spentLine(leavesLeft).en}
      </div>

      {/* The real Card, rendered rather than printed. srcDoc keeps it in its own
          document so its print stylesheet cannot leak into the kiosk. */}
      <iframe title="the Card" srcDoc={html} style={frame} />

      {result ? (
        <div style={done}>
          <b style={{ fontSize: 17 }}>{result}</b>
          <button type="button" style={primary} onClick={onDone}>
            Done
          </button>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            How did each one go? <span style={{ opacity: 0.7, fontWeight: 500 }}>每一题做得怎么样？</span>
          </div>
          {QUESTIONS.map((n) => (
            <div key={n} style={row}>
              <span style={{ fontWeight: 700, minWidth: 22 }}>{n}</span>
              {TIERS.map((t) => {
                const on = marks[n] === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    style={{
                      ...tierBtn,
                      background: on ? t.bg : '#fff',
                      color: on ? t.color : '#6b6a75',
                      borderColor: on ? t.color : '#d0cdc8',
                      fontWeight: on ? 700 : 500,
                    }}
                    onClick={() => setMarks({ ...marks, [n]: t.id })}
                  >
                    {t.label} <span style={{ fontSize: 12, opacity: 0.75 }}>{t.zh}</span>
                  </button>
                )
              })}
            </div>
          ))}

          <button type="button" style={primary} onClick={turnIn} disabled={busy || marked === 0}>
            {busy ? 'Turning it in…' : `Turn it in (${marked} marked)`}
          </button>
          <button type="button" style={ghost} onClick={onDone}>
            Throw it away
          </button>
        </>
      )}
    </div>
  )
}

const wrap: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch',
  maxWidth: 640, fontFamily: 'DM Sans, sans-serif', color: '#1a1a2e',
}
const banner: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 10, background: '#fff8e8',
  border: '1px solid #e8c98a', fontSize: 13.5, color: '#7a6a45',
}
const frame: React.CSSProperties = {
  width: '100%', height: 520, border: '1px solid #d0cdc8', borderRadius: 12, background: '#fff',
}
const row: React.CSSProperties = { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }
const tierBtn: React.CSSProperties = {
  padding: '7px 12px', fontSize: 13.5, fontFamily: 'DM Sans, sans-serif',
  borderRadius: 10, border: '2px solid', cursor: 'pointer',
}
const primary: React.CSSProperties = {
  marginTop: 6, padding: '14px 26px', fontSize: 17, fontWeight: 700,
  fontFamily: 'DM Sans, sans-serif', borderRadius: 14, border: 'none',
  background: '#4a7c59', color: '#fff', cursor: 'pointer',
}
const ghost: React.CSSProperties = {
  padding: '9px 20px', fontSize: 14, fontFamily: 'DM Sans, sans-serif',
  borderRadius: 10, border: '2px solid #d0cdc8', background: '#fff',
  color: '#6b6a75', cursor: 'pointer',
}
const done: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10, padding: '18px 20px',
  border: '2px solid #4a7c59', borderRadius: 14, background: '#fff',
}

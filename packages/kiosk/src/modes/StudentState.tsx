/**
 * One child, as a teacher needs to see them.
 *
 * The review queue answers "was this grade right". This answers the question
 * that comes straight after it and had nowhere to be asked: *did that Card
 * actually do anything to where this student is?*
 *
 * BHCS-33 built the radar for the child and said plainly that the teacher's
 * view was a separate ticket reading the same endpoint. This is that view, and
 * it reads the same endpoint.
 *
 * ── Why the attempts are shown as before → after ──
 *
 * A mastery number on its own cannot be checked. 1.00 on a strand is either a
 * child who knows it or a model that got carried away, and the only way to tell
 * from outside is to see the steps that produced it. The ledger stores each
 * question's before and after *as applied*, so this is the arithmetic a teacher
 * can actually audit rather than a conclusion they have to accept.
 *
 * It is also where the system's own weakness shows honestly. Five correct
 * answers take a Room from 0.45 to 1.00, and a teacher looking at that column
 * can see that the last two questions moved almost nothing — which is the
 * saturation to argue with, laid out rather than hidden behind a single number.
 */

import { useEffect, useState } from 'react'
import type { Student } from '@atrium/schema'

interface Spoke {
  strandId: string
  labelEn: string
  labelZh: string
  value: number
  band: { lo: number; hi: number }
  rooms: number
  seenRooms: number
  seen: boolean
}

interface Attempt {
  kcId: string
  labelEn: string
  labelZh: string
  question: number | null
  correct: boolean
  weight: number
  before: number
  after: number
  at: string
}

interface State {
  radar: { spokes?: Spoke[] }
  attempts: { attempts?: Attempt[] }
  leaves: { balance?: number; lifetimeEarned?: number; lifetimeSpent?: number }
}

export default function StudentState() {
  const [roster, setRoster] = useState<Student[]>([])
  const [studentId, setStudentId] = useState('')
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/students')
      .then((r) => r.json())
      .then((d: { students?: Student[] }) => setRoster(d.students ?? []))
      .catch(() => setError('Could not load the roster.'))
  }, [])

  useEffect(() => {
    if (!studentId) return setState(null)
    const token = localStorage.getItem('atrium.adminToken')
    fetch(`/api/student-state?studentId=${encodeURIComponent(studentId)}`, {
      headers: token ? { 'x-admin-token': token } : {},
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setState)
      .catch(() => setError('Could not read this student.'))
  }, [studentId])

  const spokes = (state?.radar.spokes ?? []).filter((s) => s.seen || s.value > 0)
  const attempts = state?.attempts.attempts ?? []
  const worked = spokes.filter((s) => s.seen)

  return (
    <div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, maxWidth: 300 }}>
        Student
        <select style={select} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">Choose…</option>
          {roster.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>

      {error && <p style={{ color: '#b4432f', fontSize: 14 }}>{error}</p>}

      {state && (
        <>
          <div style={summary}>
            <Stat n={String(state.leaves.balance ?? 0)} label="Leaves now" />
            <Stat n={String(state.leaves.lifetimeSpent ?? 0)} label="Cards printed" />
            <Stat n={String(state.leaves.lifetimeEarned ?? 0)} label="Cards turned in" />
            <Stat n={`${worked.length}/${spokes.length}`} label="Areas worked" />
          </div>

          <h3 style={h3}>Where they are</h3>
          {spokes.length === 0 && <p style={quiet}>No Floor plan yet — this student has not been placed.</p>}
          {spokes.map((s) => (
            <div key={s.strandId} style={bar}>
              <div style={{ minWidth: 190, fontSize: 13.5 }}>
                {s.labelEn} <span style={{ color: '#86838f' }}>{s.labelZh}</span>
              </div>
              <div style={track}>
                {/* The band first, the value on top: what we are unsure of,
                    behind what we think. */}
                <div style={{ ...bandFill, left: `${s.band.lo * 100}%`, width: `${(s.band.hi - s.band.lo) * 100}%` }} />
                <div style={{ ...valueFill, width: `${s.value * 100}%`, background: s.seen ? '#4a7c59' : '#c8c5bf' }} />
              </div>
              <div style={{ width: 132, fontSize: 12.5, color: '#6b6a75', textAlign: 'right' }}>
                {s.value.toFixed(2)}{' '}
                {s.seen ? `· ${s.seenRooms}/${s.rooms} worked` : '· estimate only'}
              </div>
            </div>
          ))}

          <h3 style={h3}>What moved it</h3>
          {attempts.length === 0 && (
            <p style={quiet}>Nothing recorded yet. A Card has to be scanned before anything moves.</p>
          )}
          {attempts.length > 0 && (
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>When</th>
                  <th style={th}>Room</th>
                  <th style={th}>Q</th>
                  <th style={th}></th>
                  <th style={th}>Before → after</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a, i) => (
                  <tr key={i}>
                    <td style={td}>{new Date(a.at).toLocaleTimeString()}</td>
                    <td style={td}>
                      {a.labelEn} <span style={{ color: '#86838f' }}>{a.labelZh}</span>
                    </td>
                    <td style={td}>{a.question ?? '·'}</td>
                    <td style={{ ...td, color: a.correct ? '#3f7a5e' : '#b4432f', fontWeight: 700 }}>
                      {a.correct ? '✓' : '✗'}
                      {a.weight < 1 && <span style={{ fontWeight: 400, color: '#86838f' }}> ({a.weight})</span>}
                    </td>
                    <td style={{ ...td, fontFamily: 'ui-monospace, monospace' }}>
                      {a.before.toFixed(3)} → {a.after.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{n}</div>
      <div style={{ fontSize: 11.5, color: '#86838f', textTransform: 'uppercase', letterSpacing: '.08em' }}>
        {label}
      </div>
    </div>
  )
}

const select: React.CSSProperties = {
  padding: '9px 12px', fontSize: 15, fontFamily: 'DM Sans, sans-serif',
  borderRadius: 9, border: '1px solid #d0cdc8', background: '#fff',
}
const summary: React.CSSProperties = {
  display: 'flex', gap: 34, padding: '16px 20px', marginTop: 16,
  border: '1px solid #d0cdc8', borderRadius: 12, background: '#fff',
}
const h3: React.CSSProperties = { fontSize: 13, letterSpacing: '.12em', textTransform: 'uppercase', color: '#86838f', margin: '26px 0 10px' }
const quiet: React.CSSProperties = { fontSize: 14, color: '#6b6a75' }
const bar: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 7 }
const track: React.CSSProperties = { position: 'relative', flex: 1, height: 15, background: '#f2f0ec', borderRadius: 8, overflow: 'hidden' }
const bandFill: React.CSSProperties = { position: 'absolute', top: 0, bottom: 0, background: '#dfe8e1' }
const valueFill: React.CSSProperties = { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 8 }
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
const th: React.CSSProperties = { textAlign: 'left', padding: '6px 10px', color: '#86838f', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: '1px solid #d0cdc8' }
const td: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid #efece7' }

/**
 * Simulate mode, and clearing what it wrote.
 *
 * The toggle is deliberately not subtle. A station left in simulate mode looks
 * exactly like a working one right up until a child presses the button and no
 * paper appears, so the state has to be visible from across a room — and the
 * kiosk shows a line under the Card button whenever it is on.
 *
 * Clearing is here rather than beside it because the two are different acts. A
 * rehearsal is cheap; deciding a child's history was rehearsal is not, and it
 * should take a second thought and a name.
 */

import { useEffect, useState } from 'react'
import type { Student } from '@atrium/schema'
import { adminHeader, adminToken, setAdminToken } from '../lib/admin'

export default function Settings() {
  const [on, setOn] = useState(() => localStorage.getItem('atrium.simulate') === 'on')
  const [roster, setRoster] = useState<Student[]>([])
  const [clearing, setClearing] = useState('')
  const [cleared, setCleared] = useState<string | null>(null)
  const [token, setToken] = useState(() => adminToken())
  const [tokenSaved, setTokenSaved] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/students')
      .then((r) => r.json())
      .then((d: { students?: Student[] }) => setRoster(d.students ?? []))
      .catch(() => undefined)
  }, [])

  function toggle() {
    const next = !on
    setOn(next)
    localStorage.setItem('atrium.simulate', next ? 'on' : 'off')
  }

  async function clear(studentId: string) {
    setCleared(null)
    const res = await fetch(`/api/simulated?studentId=${encodeURIComponent(studentId)}`, {
      method: 'DELETE',
      headers: adminHeader(),
    })
    const body = (await res.json()) as { removedAttempts?: number }
    setCleared(
      res.ok
        ? `Removed ${body.removedAttempts ?? 0} simulated attempts. Real work untouched.`
        : 'Could not clear that.',
    )
    setClearing('')
  }

  function saveToken() {
    setAdminToken(token.trim())
    setTokenSaved(
      token.trim()
        ? 'Saved on this machine.'
        : 'Cleared. The teacher and admin screens will stop loading.',
    )
  }

  return (
    <div style={{ maxWidth: 620 }}>
      {/*
        First, because without it the teacher and admin screens answer "Admin
        token required" and nothing on screen says where the token goes. It used
        to be a console command — a fine thing to ask of whoever deployed the
        station, and a bad one to ask of a teacher whose browser has forgotten.
      */}
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e' }}>Admin token</div>
        <p style={p}>
          Unlocks the teacher and admin screens on this machine. It is the value of
          ADMIN_TOKEN on the deployment; ask whoever set the station up. Stored in this
          browser only, so each machine needs it once.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input
            type="password"
            value={token}
            onChange={(e) => {
              setToken(e.target.value)
              setTokenSaved(null)
            }}
            placeholder="paste the token"
            style={tokenInput}
          />
          <button type="button" style={toggleBtn} onClick={saveToken}>
            Save
          </button>
        </div>
        {tokenSaved && <p style={{ ...p, color: '#4a7c59' }}>{tokenSaved}</p>}
      </div>

      <div style={{ ...card, borderColor: on ? '#c8963e' : '#d0cdc8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button type="button" style={{ ...toggleBtn, background: on ? '#c8963e' : '#fff', color: on ? '#fff' : '#1a1a2e' }} onClick={toggle}>
            {on ? 'Simulate mode is ON' : 'Simulate mode is off'}
          </button>
        </div>
        <p style={p}>
          With it on, <b>Get my Card</b> shows the Card on screen instead of printing it, and you
          mark the questions yourself. No paper, no printer, no camera, no grading call.
        </p>
        <p style={{ ...p, color: '#7a6a45' }}>
          Everything else is real: the planner picks the Room, the task is registered, a Leaf is
          spent and earned back, and mastery moves. That is the point — a rehearsal that skipped
          those would be rehearsing a different system. It is also the limit: this can tell you the
          loop works and can never tell you whether the grading is any good.
        </p>
      </div>

      <div style={card}>
        <b style={{ fontSize: 15 }}>Clear simulated work</b>
        <p style={p}>
          Rehearsals write to the same tables as real work and are marked so they can be taken back
          out. Removing them recomputes the Floor plan from what is left, so a Room with no real
          attempts goes back to showing a prior rather than a number nobody earned.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select style={select} value={clearing} onChange={(e) => setClearing(e.target.value)}>
            <option value="">Choose a student…</option>
            {roster.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button type="button" style={dangerBtn} disabled={!clearing} onClick={() => clear(clearing)}>
            Clear their simulated work
          </button>
        </div>
        {cleared && <p style={{ ...p, color: '#2f6a4f' }}>{cleared}</p>}
      </div>
    </div>
  )
}

const card: React.CSSProperties = {
  padding: '18px 22px', marginBottom: 16, borderRadius: 14,
  border: '2px solid #d0cdc8', background: '#fff', fontFamily: 'DM Sans, sans-serif',
}
const toggleBtn: React.CSSProperties = {
  padding: '11px 22px', fontSize: 16, fontWeight: 700, fontFamily: 'DM Sans, sans-serif',
  borderRadius: 12, border: '2px solid #c8963e', cursor: 'pointer',
}
const p: React.CSSProperties = { fontSize: 13.5, lineHeight: 1.6, color: '#5a5a6a', margin: '10px 0 0' }

const tokenInput: React.CSSProperties = {
  flex: 1,
  padding: '9px 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  border: '1px solid #d0cdc8',
  borderRadius: 8,
  background: '#fff',
}
const select: React.CSSProperties = {
  padding: '9px 12px', fontSize: 15, fontFamily: 'DM Sans, sans-serif',
  borderRadius: 9, border: '1px solid #d0cdc8', background: '#fff',
}
const dangerBtn: React.CSSProperties = {
  padding: '9px 18px', fontSize: 14, fontWeight: 700, fontFamily: 'DM Sans, sans-serif',
  borderRadius: 10, border: '2px solid #b4432f', background: '#fff', color: '#b4432f', cursor: 'pointer',
}

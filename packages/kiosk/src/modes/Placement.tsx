/**
 * The placement form (BHCS-32's missing half).
 *
 * BHCS-32 chose teacher-entered placement over a diagnostic Card, on the
 * grounds that a five-minute form from someone who knows the child beats twenty
 * minutes of a seven-year-old's first-ever session. It then shipped the
 * endpoint with no form, so the only way to place a student was to POST JSON by
 * hand — which is neither five minutes nor something to do at the side of a
 * child's first Visit.
 *
 * ── Why it asks for three numbers and not thirty ──
 *
 * Nobody fills in thirty Rooms. A teacher gives a grade band per subject and
 * the prior for each Room is derived from the distance to its own difficulty.
 * The two languages are asked separately because that is the whole point for
 * this school: the same child reads English at grade 3 and Chinese at grade 1,
 * and one number for "language" would be wrong for both.
 *
 * ── What it shows back ──
 *
 * The reasoning, not just a success message. Every seeded Room comes back with
 * the basis for its number — "grade 4 Room, a grade above their level" — and a
 * teacher who cannot see that has been asked to trust thirty numbers they did
 * not choose. Rooms that were skipped because the child has already worked them
 * are named too, since "measurement outranks estimate" is invisible otherwise
 * and looks like the form ignoring input.
 */

import { useEffect, useState } from 'react'
import type { Student } from '@atrium/schema'

interface Seeded {
  kcId: string
  masteryProb: number
  basis: string
}

interface Result {
  seeded: Seeded[]
  skipped: string[]
  unknownRoots: string[]
  leaves: { balance: number; granted: number }
}

const SUBJECTS = [
  { root: 'math', en: 'Math', zh: '数学' },
  { root: 'lang/en', en: 'English reading', zh: '英语阅读' },
  { root: 'lang/zh', en: 'Chinese reading', zh: '中文阅读' },
] as const

export default function Placement() {
  const [roster, setRoster] = useState<Student[]>([])
  const [studentId, setStudentId] = useState('')
  const [levels, setLevels] = useState<Record<string, number>>({
    math: 3,
    'lang/en': 3,
    'lang/zh': 1,
  })
  const [note, setNote] = useState('')
  const [placedBy, setPlacedBy] = useState(() => localStorage.getItem('atrium.teacher') ?? '')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/students')
      .then((r) => r.json())
      .then((d: { students?: Student[] }) => setRoster(d.students ?? []))
      .catch(() => setError('Could not load the roster.'))
  }, [])

  async function submit() {
    if (!studentId || !placedBy) return
    setBusy(true)
    setError(null)
    setResult(null)
    localStorage.setItem('atrium.teacher', placedBy)
    try {
      const token = localStorage.getItem('atrium.adminToken')
      const res = await fetch('/api/placement', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { 'x-admin-token': token } : {}) },
        body: JSON.stringify({ studentId, placedBy, levels, ...(note ? { note } : {}) }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? String(res.status))
      setResult(body as Result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p style={{ margin: '0 0 18px', fontSize: 14, color: '#6b6a75', maxWidth: 620, lineHeight: 1.6 }}>
        Roughly where is this child now? Three answers is enough — the Blueprint works out the
        rest. Rooms they have already worked are never overwritten, so this is safe to redo when
        your view of them changes.
      </p>

      <div style={grid}>
        <label style={label}>
          Student
          <select style={input} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Choose…</option>
            {roster.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.grade != null ? ` · grade ${s.grade}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label style={label}>
          Your name
          <input
            style={input}
            value={placedBy}
            onChange={(e) => setPlacedBy(e.target.value)}
            placeholder="who is placing them"
          />
        </label>
      </div>

      <div style={{ ...grid, marginTop: 6 }}>
        {SUBJECTS.map((s) => (
          <label key={s.root} style={label}>
            {s.en} <span style={{ color: '#86838f', fontWeight: 400 }}>{s.zh}</span>
            <select
              style={input}
              value={levels[s.root]}
              onChange={(e) => setLevels({ ...levels, [s.root]: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((g) => (
                <option key={g} value={g}>
                  About grade {g}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <label style={{ ...label, marginTop: 10, display: 'block' }}>
        Anything worth knowing <span style={{ color: '#86838f', fontWeight: 400 }}>(optional)</span>
        <input
          style={{ ...input, width: '100%' }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="new to the school, strong at arithmetic, has never written characters"
        />
      </label>

      <button type="button" style={submitBtn} onClick={submit} disabled={busy || !studentId || !placedBy}>
        {busy ? 'Placing…' : 'Place this student'}
      </button>

      {error && <p style={{ color: '#b4432f', fontSize: 14 }}>{error}</p>}

      {result && (
        <div style={resultBox}>
          <b style={{ fontSize: 16 }}>
            {result.seeded.length} Rooms placed
            {result.leaves.granted > 0 && ` · ${result.leaves.granted} Leaves to start`}
          </b>
          {result.skipped.length > 0 && (
            <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#6b6a75' }}>
              {result.skipped.length} left alone — this student has already worked them, and
              measured work is never overwritten by an estimate.
            </p>
          )}
          {result.unknownRoots.length > 0 && (
            <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#b4432f' }}>
              Not recognised: {result.unknownRoots.join(', ')}
            </p>
          )}
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {result.seeded.slice(0, 8).map((s) => (
              <div key={s.kcId} style={{ fontSize: 12.5, display: 'flex', gap: 10 }}>
                <span style={{ fontFamily: 'ui-monospace, monospace', minWidth: 40 }}>
                  {s.masteryProb.toFixed(2)}
                </span>
                <span style={{ minWidth: 250 }}>{s.kcId}</span>
                <span style={{ color: '#86838f' }}>{s.basis}</span>
              </div>
            ))}
            {result.seeded.length > 8 && (
              <span style={{ fontSize: 12.5, color: '#86838f' }}>
                …and {result.seeded.length - 8} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const grid: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 14 }
const label: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  fontSize: 13,
  fontWeight: 600,
  color: '#1a1a2e',
}
const input: React.CSSProperties = {
  padding: '9px 12px',
  fontSize: 15,
  fontFamily: 'DM Sans, sans-serif',
  borderRadius: 9,
  border: '1px solid #d0cdc8',
  background: '#fff',
  minWidth: 210,
}
const submitBtn: React.CSSProperties = {
  marginTop: 16,
  padding: '12px 26px',
  fontSize: 16,
  fontWeight: 700,
  fontFamily: 'DM Sans, sans-serif',
  borderRadius: 12,
  border: 'none',
  background: '#4a7c59',
  color: '#fff',
  cursor: 'pointer',
}
const resultBox: React.CSSProperties = {
  marginTop: 18,
  padding: '16px 20px',
  borderRadius: 12,
  border: '1px solid #d0cdc8',
  background: '#fff',
}

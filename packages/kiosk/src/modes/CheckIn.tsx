import { useEffect, useMemo, useState } from 'react'
import type { Student } from '../App'

interface Props {
  onCheckIn: (student: Student) => void
}

/**
 * Prefix for students identified without the roster. Kept greppable on purpose:
 * `select * from captures where student_id like 'unlinked:%'` is the
 * reconciliation query once the portal is reachable again.
 */
const UNLINKED_PREFIX = 'unlinked:'

export default function CheckIn({ onCheckIn }: Props) {
  const [students, setStudents] = useState<Student[] | null>(null)
  const [query, setQuery] = useState('')
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [unlinkedName, setUnlinkedName] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/students')
      .then(async (res) => {
        if (!res.ok) {
          const detail = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(detail.error ?? `Roster unavailable (${res.status})`)
        }
        return res.json() as Promise<{ students: Student[] }>
      })
      .then((data) => setStudents(data.students))
      .catch((err) => setErrMsg((err as Error).message))
  }, [])

  // A full school roster is too long to scan visually, and the station has a
  // keyboard — typing two letters beats scrolling.
  const visible = useMemo(() => {
    if (!students) return []
    const q = query.trim().toLowerCase()
    const matches = q ? students.filter((s) => s.name.toLowerCase().includes(q)) : students
    return matches.slice(0, 40)
  }, [students, query])

  function startUnlinked() {
    const name = (unlinkedName ?? '').trim()
    if (!name) return
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    onCheckIn({ id: `${UNLINKED_PREFIX}${slug}`, name })
  }

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 36, fontWeight: 700, margin: 0 }}>Welcome to Atrium</h1>
      <p style={{ fontSize: 18, color: '#555', margin: 0 }}>欢迎来到学习中心</p>

      {!students && !errMsg && <p style={{ color: '#888' }}>Loading roster…</p>}

      {/*
        The roster is a network dependency in a room where the network is not
        guaranteed. Capture hardware needs no backend at all, so an unreachable
        portal must never take the station offline — it should only cost us the
        student's real ID, which we can reattach later.
      */}
      {errMsg && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: 380 }}>
          <div style={{ padding: 16, background: '#fff8ee', border: '1px solid #f0d9a8', borderRadius: 12 }}>
            <strong style={{ color: '#8a6a00', fontSize: 14 }}>Roster unavailable</strong>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#8a6a00' }}>{errMsg}</p>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#999' }}>
              You can keep working — type a name and captures will be saved under
              it, then linked to the real student record later.
            </p>
          </div>

          <input
            autoFocus
            value={unlinkedName ?? ''}
            onChange={(e) => setUnlinkedName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && startUnlinked()}
            placeholder="Student name"
            style={search}
          />
          <button
            onClick={startUnlinked}
            disabled={!unlinkedName?.trim()}
            style={{ ...continueBtn, opacity: unlinkedName?.trim() ? 1 : 0.5 }}
          >
            Continue without check-in →
          </button>
        </div>
      )}

      {students && (
        // Fixed-width column: `search` is width:100%, so it needs a bounded
        // parent or it stretches to the viewport.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: 360 }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type your name…"
            style={search}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '46vh', overflowY: 'auto' }}>
            {visible.map((s) => (
              <button key={s.id} onClick={() => onCheckIn(s)} style={studentBtn}>
                {s.name}
                {s.nameZh && <span style={{ color: '#888', fontSize: 14 }}> {s.nameZh}</span>}
              </button>
            ))}
            {visible.length === 0 && (
              <p style={{ color: '#999', fontSize: 14, textAlign: 'center' }}>No match for “{query}”</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const wrap: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 }
const search: React.CSSProperties = { width: '100%', padding: '14px 18px', fontSize: 17, fontFamily: 'DM Sans, sans-serif', borderRadius: 12, border: '1px solid #d0cdc8', boxSizing: 'border-box' }
const studentBtn: React.CSSProperties = { padding: '16px 24px', fontSize: 18, fontFamily: 'DM Sans, sans-serif', fontWeight: 500, borderRadius: 12, border: '2px solid #d0cdc8', background: '#fff', cursor: 'pointer', textAlign: 'left' }
const continueBtn: React.CSSProperties = { padding: '14px 28px', fontSize: 16, fontFamily: 'DM Sans, sans-serif', fontWeight: 600, borderRadius: 12, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer', width: '100%' }

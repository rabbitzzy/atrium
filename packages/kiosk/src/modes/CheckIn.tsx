import { useEffect, useMemo, useState } from 'react'
import type { Student } from '../App'

interface Props {
  onCheckIn: (student: Student) => void
}

export default function CheckIn({ onCheckIn }: Props) {
  const [students, setStudents] = useState<Student[] | null>(null)
  const [query, setQuery] = useState('')
  const [errMsg, setErrMsg] = useState<string | null>(null)

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

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 36, fontWeight: 700, margin: 0 }}>Welcome to Atrium</h1>
      <p style={{ fontSize: 18, color: '#555', margin: 0 }}>欢迎来到学习中心</p>

      {errMsg && (
        <div style={{ padding: 16, background: '#fff0ee', border: '1px solid #ffc8c0', borderRadius: 12, maxWidth: 420 }}>
          <strong style={{ color: '#c04010', fontSize: 14 }}>Couldn&apos;t load the roster</strong>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#c04010' }}>{errMsg}</p>
        </div>
      )}

      {!students && !errMsg && <p style={{ color: '#888' }}>Loading roster…</p>}

      {students && (
        <>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type your name…"
            style={search}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 360, maxHeight: '46vh', overflowY: 'auto' }}>
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
        </>
      )}
    </div>
  )
}

const wrap: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 }
const search: React.CSSProperties = { width: 360, padding: '14px 18px', fontSize: 17, fontFamily: 'DM Sans, sans-serif', borderRadius: 12, border: '1px solid #d0cdc8' }
const studentBtn: React.CSSProperties = { padding: '16px 24px', fontSize: 18, fontFamily: 'DM Sans, sans-serif', fontWeight: 500, borderRadius: 12, border: '2px solid #d0cdc8', background: '#fff', cursor: 'pointer', textAlign: 'left' }

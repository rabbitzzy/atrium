import { useEffect, useMemo, useState } from 'react'
import type { Student } from '@atrium/schema'

interface Props {
  onCheckIn: (student: Student) => void
}

/**
 * Prefix for students identified without the roster. Kept greppable on purpose:
 * `select * from captures where student_id like 'unlinked:%'` is the
 * reconciliation query once the portal is reachable again.
 */
const UNLINKED_PREFIX = 'unlinked:'

/**
 * How many names can be on screen at once.
 *
 * Five is about where a child stops reading and starts scanning, and with
 * prefix matching a second keystroke almost always gets below it anyway. It is
 * also what makes the fixed-height suggestion area possible: a bounded list
 * means the box above it can never move.
 */
const MAX_SUGGESTIONS = 5

/**
 * How well a student matches what has been typed — lower is better, null is
 * no match at all.
 *
 * Word starts only. Substring matching looked more generous and was in fact
 * useless: one letter into "h", a roster came back holding everyone named Hu,
 * Zhu *and* Smith, because the letter appears somewhere inside all of them.
 * Nobody types the middle of their own name. A child types the front of it,
 * either their given name or their family name, so those are the two things
 * that count — with the given name first, because that is what they answer to.
 *
 * Chinese names are compared unlowercased and whole: there are no word breaks
 * to split on and no case to fold.
 */
function rankMatch(s: Student, q: string, raw: string): number | null {
  const name = s.name.toLowerCase()
  if (name.startsWith(q)) return 0
  if (s.nameZh?.startsWith(raw)) return 0
  if (name.split(/\s+/).some((part) => part.startsWith(q))) return 1
  return null
}

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

  /*
   * Autocomplete, not a roster.
   *
   * The full list was never useful: a school's worth of names is longer than
   * the screen, so the student scrolls past their own name as often as they
   * find it, and every other child's name is on display while they do it. An
   * empty query now shows nothing — the first keystroke is what produces
   * candidates, and a handful of them is all a keyboard needs.
   */
  const visible = useMemo(() => {
    const raw = query.trim()
    const q = raw.toLowerCase()
    if (!students || !q) return []
    return students
      .map((s) => ({ s, rank: rankMatch(s, q, raw) }))
      .filter((m): m is { s: Student; rank: number } => m.rank !== null)
      .sort((a, b) => a.rank - b.rank || a.s.name.localeCompare(b.s.name))
      .slice(0, MAX_SUGGESTIONS)
      .map((m) => m.s)
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
            // One unambiguous match and a keyboard already under their hands:
            // Enter finishes the job rather than sending them to the mouse.
            onKeyDown={(e) => {
              const only = visible.length === 1 ? visible[0] : null
              if (e.key === 'Enter' && only) onCheckIn(only)
            }}
            placeholder="Type your name…"
            style={search}
          />
          {/*
            The suggestions hang below the box in space that is already there.
            Nothing above them moves as they come and go — the heading and the
            box the student is typing into are anchored by the layout, not by
            how many names happen to match this keystroke. A title that jumps
            up the screen mid-word is the one thing guaranteed to make someone
            stop typing and look at it.

            Empty before the first keystroke, on purpose: blank space under a
            focused box reads as "type here", which is the whole instruction.
          */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visible.map((s) => (
              <button key={s.id} onClick={() => onCheckIn(s)} style={studentBtn}>
                {s.name}
                {s.nameZh && <span style={{ color: '#888', fontSize: 14 }}> {s.nameZh}</span>}
              </button>
            ))}
            {query.trim() && visible.length === 0 && (
              <p style={{ color: '#999', fontSize: 14, textAlign: 'center' }}>No match for “{query}”</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/*
 * Anchored to the top, not centered.
 *
 * Centering a column whose height depends on how many names matched means the
 * heading and the input slide upward with every keystroke that finds one more
 * student — the box moves out from under the cursor while it is being typed
 * into. `paddingTop` puts the title roughly where centering used to put it on
 * a station monitor, and it stays there.
 */
const wrap: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 20, padding: '14vh 24px 24px' }
const search: React.CSSProperties = { width: '100%', padding: '14px 18px', fontSize: 17, fontFamily: 'DM Sans, sans-serif', borderRadius: 12, border: '1px solid #d0cdc8', boxSizing: 'border-box' }
const studentBtn: React.CSSProperties = { padding: '16px 24px', fontSize: 18, fontFamily: 'DM Sans, sans-serif', fontWeight: 500, borderRadius: 12, border: '2px solid #d0cdc8', background: '#fff', cursor: 'pointer', textAlign: 'left' }
const continueBtn: React.CSSProperties = { padding: '14px 28px', fontSize: 16, fontFamily: 'DM Sans, sans-serif', fontWeight: 600, borderRadius: 12, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer', width: '100%' }

/**
 * The review queue (BHCS-43), at #teacher.
 *
 * Phase 1 of the trust arc — the Observer phase. The teacher's mental model is
 * "the AI does the first pass, I sign off", which is how they already work with
 * a student teacher, and that familiarity is the whole point.
 *
 * ── Why every row leads with the transcript ──
 *
 * The ticket's central warning is that "a queue that shows a verdict without
 * its basis produces rubber-stamping, which looks like trust and is the
 * opposite — the teacher stops reading and the system loses the correction
 * signal it was built to collect."
 *
 * So the grade is the smallest thing on the row. What is large is the scan and
 * the transcript, because the transcript is where wrong grades actually begin:
 * a 4 read as a 9 produces impeccable reasoning about an answer nobody gave,
 * and a teacher who is shown only "needs help on question 3" has no way to
 * catch that. Shown "read as 1/9" beside the child's handwriting, they catch it
 * in a second.
 *
 * ── Why opening an item is recorded ──
 *
 * Open question #1 in `teacher-direction.md` — what queue length leaves a
 * teacher in control rather than buried — is unanswered, and it decides when
 * flagged-only review can begin. Guessing it is how the feature fails, so the
 * position each opened item held is logged from the first day.
 *
 * ── Why this file is allowed to name a capture kind ──
 *
 * It imports `app-worksheet`'s tier table, which platform code may not do. It
 * is not platform code. `impl/architecture.md`'s rule is about the capture
 * pipeline — `src/lib`, `api/_lib`, and the components that run a capture — and
 * its greppable check covers exactly those directories. This is a third
 * surface that shares a deployment with the platform because BHCS-42 chose one
 * deploy, not a layer that has quietly learned what a worksheet is.
 *
 * The tiers are imported rather than restated on purpose: the teacher has to
 * see the same words the child saw. A queue that renders `needs-help` while the
 * Debrief said "let's look at this one together" is two systems describing one
 * judgement, and the teacher is reviewing the wrong one.
 */

import { useEffect, useState } from 'react'
import { qc } from '@atrium/app-worksheet/tiers'
import Placement from './Placement'
import StudentState from './StudentState'

interface Question {
  number?: number
  quality?: string
  transcript?: string
  misconception?: string | null
  suggestion?: string | null
}

interface QueueItem {
  sessionTaskId: string
  studentId: string | null
  /** Joined from `captures` by the proxy — a UUID is not a child. */
  studentName?: string | null
  captureId: string | null
  scanUrl: string | null
  submittedAt: string
  overallQuality: string
  summaryEn: string
  summaryZh: string
  questions: Question[]
}

type Tab = 'queue' | 'student' | 'placement'

export default function Teacher() {
  const [tab, setTab] = useState<Tab>('queue')
  const [items, setItems] = useState<QueueItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [teacher] = useState(() => localStorage.getItem('atrium.teacher') ?? 'unknown')

  useEffect(() => {
    fetch('/api/teacher-queue', { headers: adminHeader() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { items: QueueItem[] }) => setItems(d.items))
      .catch(() => setError('Could not load the queue.'))
  }, [])

  function openItem(item: QueueItem, index: number) {
    const next = open === item.sessionTaskId ? null : item.sessionTaskId
    setOpen(next)
    if (!next) return
    fetch(`/api/teacher-queue?id=${encodeURIComponent(item.sessionTaskId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...adminHeader() },
      body: JSON.stringify({ teacher, position: index + 1, queueLength: items?.length ?? 0 }),
    }).catch(() => undefined)
  }

  return (
    <div style={page}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 12px', fontSize: 24 }}>
          {tab === 'queue' ? 'Review queue' : tab === 'student' ? 'How is this student doing?' : 'Place a student'}
        </h1>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button type="button" style={tabBtn(tab === 'queue')} onClick={() => setTab('queue')}>
            Review queue{items ? ` (${items.length})` : ''}
          </button>
          <button type="button" style={tabBtn(tab === 'student')} onClick={() => setTab('student')}>
            A student
          </button>
          <button type="button" style={tabBtn(tab === 'placement')} onClick={() => setTab('placement')}>
            Place a student
          </button>
        </div>
        {tab === 'queue' && (
          <p style={{ margin: 0, fontSize: 14, color: '#6b6a75' }}>
            Every AI grade from the last 7 days that nobody has signed off. Hardest cases first.
          </p>
        )}
      </header>

      {tab === 'student' && <StudentState />}
      {tab === 'placement' && <Placement />}

      {tab === 'queue' && error && <p style={{ color: '#b4432f' }}>{error}</p>}
      {tab === 'queue' && !items && !error && <p style={{ color: '#6b6a75' }}>Loading…</p>}
      {tab === 'queue' && items?.length === 0 && (
        <p style={{ color: '#6b6a75' }}>Nothing waiting. Every grade this week has been seen.</p>
      )}

      {tab === 'queue' && items?.map((item, i) => {
        const look = qc(item.overallQuality)
        const isOpen = open === item.sessionTaskId
        return (
          <div key={item.sessionTaskId} style={card}>
            <button type="button" style={rowBtn} onClick={() => openItem(item, i)}>
              <span style={{ ...pill, background: look.bg, color: look.color }}>
                {look.label} <span style={{ opacity: 0.7 }}>{look.labelZh}</span>
              </span>
              <span style={{ fontWeight: 600 }}>
                {item.studentName ?? item.studentId ?? 'unknown student'}
              </span>
              <span style={{ color: '#86838f', fontSize: 13 }}>
                {new Date(item.submittedAt).toLocaleString()}
              </span>
              <span style={{ marginLeft: 'auto', color: '#86838f' }}>{isOpen ? '▲' : '▼'}</span>
            </button>

            {isOpen && (
              <div style={body}>
                {/* The basis, not the conclusion. Image first, at a size that
                    can actually be read. */}
                {item.scanUrl && (
                  <a href={item.scanUrl} target="_blank" rel="noreferrer">
                    <img src={item.scanUrl} alt="the student's page" style={scan} />
                  </a>
                )}
                {!item.scanUrl && (
                  <p style={{ ...note, background: '#fff3d1' }}>
                    No scan linked to this grade — it predates the capture link, so the
                    transcript below is all the basis there is.
                  </p>
                )}

                {item.questions.map((q, qi) => (
                  <div key={qi} style={qRow}>
                    <div style={{ fontWeight: 700, minWidth: 28 }}>{q.number ?? '·'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: '#86838f' }}>read as</div>
                      <div style={transcript}>{q.transcript || <em>nothing written</em>}</div>
                      {q.misconception && (
                        <div style={{ ...note, background: '#fdf0ec' }}>
                          <b>Why this grade:</b> {q.misconception}
                        </div>
                      )}
                      {q.suggestion && (
                        <div style={{ ...note, background: '#eef4fa' }}>
                          <b>Told the student:</b> {q.suggestion}
                        </div>
                      )}
                    </div>
                    <div style={{ ...pill, background: qc(q.quality ?? '').bg, color: qc(q.quality ?? '').color }}>
                      {qc(q.quality ?? '').label}
                    </div>
                  </div>
                ))}

                {item.summaryEn && (
                  <p style={{ ...note, background: '#f2f0ec' }}>
                    {item.summaryEn}
                    <br />
                    <span style={{ color: '#6b6a75' }}>{item.summaryZh}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function adminHeader(): Record<string, string> {
  const t = localStorage.getItem('atrium.adminToken')
  return t ? { 'x-admin-token': t } : {}
}

const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  fontSize: 14,
  fontWeight: 700,
  fontFamily: 'DM Sans, sans-serif',
  borderRadius: 10,
  border: active ? '2px solid #1a1a2e' : '2px solid #d0cdc8',
  background: active ? '#1a1a2e' : '#fff',
  color: active ? '#fff' : '#1a1a2e',
  cursor: 'pointer',
})

const page: React.CSSProperties = {
  fontFamily: 'DM Sans, sans-serif',
  maxWidth: 860,
  margin: '0 auto',
  padding: '32px 24px 64px',
  color: '#1a1a2e',
}
const card: React.CSSProperties = {
  border: '1px solid #d0cdc8',
  borderRadius: 12,
  marginBottom: 10,
  background: '#fff',
  overflow: 'hidden',
}
const rowBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  padding: '12px 16px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 14,
  textAlign: 'left',
}
const pill: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: 'nowrap',
}
const body: React.CSSProperties = {
  padding: '4px 16px 16px',
  borderTop: '1px solid #e4e1db',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}
const scan: React.CSSProperties = {
  width: '100%',
  maxHeight: 460,
  objectFit: 'contain',
  borderRadius: 8,
  border: '1px solid #e4e1db',
  background: '#faf9f7',
}
const qRow: React.CSSProperties = { display: 'flex', gap: 12, alignItems: 'flex-start' }
const transcript: React.CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: 17,
  padding: '4px 8px',
  background: '#f2f0ec',
  borderRadius: 6,
  display: 'inline-block',
  minWidth: 60,
}
const note: React.CSSProperties = {
  fontSize: 13.5,
  lineHeight: 1.55,
  padding: '8px 12px',
  borderRadius: 8,
  margin: '6px 0 0',
}

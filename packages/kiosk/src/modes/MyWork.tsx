/**
 * My Work — everything this student has ever put under the camera.
 *
 * The paper leaves with the child, the file stays with us, and until now there
 * was no way for them to see it again: the only link to a stored capture was
 * one "Open original" line on the result screen, which pointed at Google Drive
 * — a filesystem, behind a login, in adult English. A seven-year-old asking
 * "where did my dragon drawing go?" had no answer at this station.
 *
 * ── Designed backwards from a five-year-old ─────────────────────────────────
 *
 * **Pictures, not filenames.** The thumbnail is the whole item. A child
 * recognises their own page instantly and can read neither `capture_4f3e.jpg`
 * nor the date it was taken, so nothing is keyed on text they have to decode.
 *
 * **Two filters, both tappable, neither typed.** By kind, using the exact same
 * emoji and colours as the buttons they pressed to make the capture — the
 * connection between "I pressed the pink one" and "my drawings are behind the
 * pink one" needs no explanation. And by when, in words a child uses: today,
 * yesterday, this week. No date pickers, no calendars, no month names.
 *
 * **One tap in, one big button out.** Every screen here has exactly one way
 * back, in the same place, and it is large. Depth is where children get lost,
 * so there are only ever two levels: the grid, and one picture.
 *
 * The kind filter is built from the app registry, so a fourth capture kind
 * appears here on its own — this file names no kind, exactly like the rest of
 * the platform.
 */

import { useEffect, useMemo, useState } from 'react'
import type { Student } from '@atrium/schema'
import { APPS, appById } from '../platform/registry'
import { SpokenDebrief } from '../platform/ReadAloud'

interface Work {
  id: string
  kind: string
  fileUrl: string
  capturedAt: string
}

/**
 * One capture with what was said about it, fetched only when a child opens it.
 *
 * `ocr` is `unknown` here for the same reason it is everywhere else in the
 * platform: the shape belongs to the app that produced it, and this file is
 * only ever allowed to hand it back to that app's own `ResultView`.
 */
interface WorkDetail extends Work {
  ocrStatus: string
  ocrError: string | null
  ocr: unknown
}

/**
 * The buckets, newest first. Deliberately coarse: a child looking for last
 * Tuesday's worksheet does not think in dates, they think "a while ago", and a
 * bucket per day would turn one scroll into thirty headings.
 */
type Bucket = { key: string; en: string; zh: string; items: Work[] }

const DAY_MS = 86_400_000

/** Midnight today, in the station's own timezone — the day boundary a child means. */
function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function bucketize(items: Work[]): Bucket[] {
  const today = startOfToday()
  const buckets: Bucket[] = [
    { key: 'today', en: 'Today', zh: '今天', items: [] },
    { key: 'yesterday', en: 'Yesterday', zh: '昨天', items: [] },
    { key: 'week', en: 'This week', zh: '这周', items: [] },
    { key: 'earlier', en: 'Before that', zh: '以前', items: [] },
  ]

  for (const item of items) {
    const at = new Date(item.capturedAt).getTime()
    const bucket =
      at >= today ? buckets[0] : at >= today - DAY_MS ? buckets[1] : at >= today - 7 * DAY_MS ? buckets[2] : buckets[3]
    bucket!.items.push(item)
  }

  return buckets.filter((b) => b.items.length > 0)
}

export default function MyWork({ student, onBack }: { student: Student; onBack: () => void }) {
  const [items, setItems] = useState<Work[] | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  /** null is "everything" — the state a child lands in and returns to. */
  const [kind, setKind] = useState<string | null>(null)
  const [open, setOpen] = useState<Work | null>(null)

  useEffect(() => {
    fetch(`/api/my-work?studentId=${encodeURIComponent(student.id)}`)
      .then(async (res) => {
        if (!res.ok) {
          const detail = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(detail.error ?? `Could not load your work (${res.status})`)
        }
        return res.json() as Promise<{ captures: Work[] }>
      })
      .then((data) => setItems(data.captures))
      .catch((err) => setErrMsg((err as Error).message))
  }, [student.id])

  const buckets = useMemo(
    () => bucketize((items ?? []).filter((w) => kind === null || w.kind === kind)),
    [items, kind],
  )

  // One picture and what was said about it. The way out is the same button in
  // the same place as on the grid, so "back" is one thing to learn, not two.
  if (open) {
    return (
      <div style={page}>
        <button onClick={() => setOpen(null)} style={bigBack}>← Back 返回</button>
        <WorkDetailView work={open} student={student} />
      </div>
    )
  }

  return (
    <div style={page}>
      <button onClick={onBack} style={bigBack}>← Back to camera 回到相机</button>

      <h2 style={{ fontSize: 26, fontWeight: 700, margin: 0, textAlign: 'center' }}>
        My work 我的作品
      </h2>

      {/* Filter by kind. "All" first and selected by default, so the child who
          taps nothing still sees everything they have made. */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <FilterChip
          active={kind === null}
          tint="#f0ede8"
          accent="#1a1a2e"
          onClick={() => setKind(null)}
          icon="🗂️"
          label="All"
          labelZh="全部"
        />
        {APPS.map((a) => (
          <FilterChip
            key={a.id}
            active={kind === a.id}
            tint={a.theme?.tint ?? '#f0ede8'}
            accent={a.theme?.accent ?? '#1a1a2e'}
            onClick={() => setKind(a.id)}
            icon={a.icon}
            label={a.label}
            labelZh={a.labelZh}
          />
        ))}
      </div>

      {!items && !errMsg && <p style={{ textAlign: 'center', color: '#999' }}>Looking in your folder… 正在找…</p>}

      {errMsg && (
        <div style={{ padding: 16, background: '#fff8ee', border: '1px solid #f0d9a8', borderRadius: 12 }}>
          <strong style={{ color: '#8a6a00', fontSize: 14 }}>Could not open your folder</strong>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#8a6a00' }}>{errMsg}</p>
        </div>
      )}

      {items && buckets.length === 0 && (
        <p style={{ textAlign: 'center', color: '#999', fontSize: 17, padding: '32px 0' }}>
          Nothing here yet. Put a page under the camera!
          <br />
          <span style={{ fontSize: 15 }}>这里还没有东西，先拍一张吧！</span>
        </p>
      )}

      {buckets.map((b) => (
        <div key={b.key} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: '#1a1a2e' }}>
            {b.en} <span style={{ color: '#999', fontWeight: 600, fontSize: 16 }}>{b.zh}</span>
          </div>
          <div style={grid}>
            {b.items.map((w) => {
              const app = appById(w.kind)
              return (
                <button key={w.id} onClick={() => setOpen(w)} className="work-card" style={{ ...workCard, borderColor: app?.theme?.accent ?? '#d0cdc8' }}>
                  <img src={w.fileUrl} alt="" style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: 12, background: '#f0ede8', display: 'block' }} />
                  {/* The kind badge sits on the picture rather than beside it,
                      so the card stays one target rather than reading as two. */}
                  <span style={{ position: 'absolute', top: 12, left: 12, fontSize: 24, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))' }}>
                    {app?.icon ?? '📄'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <style>{`
        .work-card { transition: transform 120ms ease; }
        .work-card:hover { transform: translateY(-3px); }
        .work-card:active { transform: translateY(1px); }
      `}</style>
    </div>
  )
}

/**
 * A piece of work, beside what the station said about it at the time.
 *
 * The Debrief was previously a thing a child saw once, for as long as they
 * happened to stand there, and then never again — which is a strange fate for
 * the one artifact in this system that is supposed to tell them what to do
 * next. Here it is permanent, and it is rendered by exactly the component that
 * rendered it live: `app.ResultView`, handed the same `refined ?? ocr` payload
 * the capture screen was handed. There is no second, read-only version of a
 * Debrief to drift out of step with the first.
 *
 * The picture keeps its column. Feedback about work, read without the work in
 * front of you, is a paragraph about nothing — and a week later the child has
 * certainly forgotten what they wrote.
 */
function WorkDetailView({ work, student }: { work: Work; student: Student }) {
  const [detail, setDetail] = useState<WorkDetail | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const app = appById(work.kind)

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setErrMsg(null)
    fetch(`/api/my-work?studentId=${encodeURIComponent(student.id)}&id=${encodeURIComponent(work.id)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not open this one (${res.status})`)
        return res.json() as Promise<{ capture: WorkDetail }>
      })
      .then((data) => !cancelled && setDetail(data.capture))
      .catch((err) => !cancelled && setErrMsg((err as Error).message))
    return () => {
      cancelled = true
    }
  }, [work.id, student.id])

  return (
    <>
      <div style={{ fontSize: 17, color: '#666', textAlign: 'center' }}>
        {app?.icon} {app?.label} · {friendlyDate(work.capturedAt)}
      </div>

      <style>{`
        .work-detail { display: grid; gap: 20px; grid-template-columns: minmax(0, 1fr); align-items: start; }
        @media (min-width: 880px) {
          .work-detail { grid-template-columns: 360px minmax(0, 1fr); }
        }
      `}</style>

      <div className="work-detail">
        <img
          src={work.fileUrl}
          alt="Your work"
          style={{ width: '100%', borderRadius: 16, border: '1px solid #e6e3de', background: '#fff' }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!detail && !errMsg && <p style={{ color: '#999' }}>Finding what I said… 正在找我说过的话…</p>}
          {errMsg && <p style={{ color: '#8a6a00' }}>{errMsg}</p>}

          {/*
            Three outcomes, and only one of them is the app's business. A read
            that failed and a kind that is never read at all are both facts
            about the pipeline, so the platform says those itself — exactly as
            `ResultCard` does on the capture screen.
          */}
          {detail?.ocrStatus === 'failed' && (
            <div style={{ padding: 16, background: '#fff8ee', border: '1px solid #f0d9a8', borderRadius: 12 }}>
              <strong style={{ color: '#8a6a00' }}>This one couldn’t be read</strong>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: '#8a6a00' }}>
                Your picture is safe — the reading is the part that did not work.
              </p>
            </div>
          )}

          {detail && detail.ocrStatus === 'ok' && detail.ocr != null && app && (
            <>
              {/*
                Read-aloud belongs here more than anywhere (BHCS-15). A Debrief
                heard once at the station is heard while a child is still
                holding the pencil; this is where they come back to it a week
                later, and where a five-year-old comes to hear it a second time.
                Keyed by capture so opening a different one starts a new script
                rather than continuing the old one.
              */}
              <SpokenDebrief key={work.id} app={app} ocr={detail.ocr} student={student} />
              <app.ResultView result={detail.ocr} student={student} />
            </>
          )}

          {detail && detail.ocrStatus === 'skipped' && (
            <p style={{ color: '#888', fontSize: 15 }}>
              Kept just as you made it. 原样保存，没有打分。
            </p>
          )}
        </div>
      </div>
    </>
  )
}

function FilterChip({
  active,
  tint,
  accent,
  onClick,
  icon,
  label,
  labelZh,
}: {
  active: boolean
  tint: string
  accent: string
  onClick: () => void
  icon: string
  label: string
  labelZh: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 18px',
        borderRadius: 999,
        border: `3px solid ${active ? accent : 'transparent'}`,
        background: tint,
        cursor: 'pointer',
        fontFamily: 'DM Sans, sans-serif',
        fontSize: 16,
        fontWeight: 700,
        color: '#1a1a2e',
      }}
    >
      <span style={{ fontSize: 22 }}>{icon}</span>
      {label} <span style={{ color: accent, fontWeight: 600 }}>{labelZh}</span>
    </button>
  )
}

/** Month and day only. A year on a kiosk that opened this year says nothing. */
function friendlyDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/* No padding of its own: this renders inside the capture screen's container,
   which already has it. */
const page: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', width: '100%', gap: 18 }
const grid: React.CSSProperties ={ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }
const workCard: React.CSSProperties = { position: 'relative', padding: 6, borderRadius: 16, border: '3px solid', background: '#fff', cursor: 'pointer' }
/** Full width and 56px tall: the way out is never something to hunt for. */
const bigBack: React.CSSProperties = { alignSelf: 'flex-start', padding: '14px 24px', fontSize: 17, fontWeight: 700, fontFamily: 'DM Sans, sans-serif', borderRadius: 14, border: '2px solid #d0cdc8', background: '#fff', color: '#1a1a2e', cursor: 'pointer' }

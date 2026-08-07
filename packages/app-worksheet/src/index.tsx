/**
 * Worksheet — kiosk half.
 *
 * Owns how a graded worksheet presents itself: the picker entry, and the
 * Debrief the student reads after submitting. The platform renders none of
 * this; it renders `app.ResultView` and does not know what a quality tier is.
 */

import type { CaptureApp, QualityTier } from '@atrium/schema'

export interface WorksheetOcr {
  questions: {
    number: number
    quality: string
    transcript: string
    misconception: string | null
    suggestion: string | null
  }[]
  overall_quality: string
  summary_en: string
  summary_zh: string
  next_focus: string
}

/*
 * Keyed by string rather than QualityTier so an unrecognized tier falls back
 * instead of crashing the Debrief — the `satisfies` keeps the four real tiers
 * exhaustive without giving up that fallback.
 */
const QUALITY_COLORS: Record<string, { bg: string; color: string }> = {
  mastered: { bg: '#d4f0e0', color: '#1a7a4a' },
  shaky: { bg: '#fff3d4', color: '#8a6a00' },
  'needs-help': { bg: '#ffe0d4', color: '#c04010' },
  'not-yet': { bg: '#f0f0f0', color: '#666' },
} satisfies Record<QualityTier, { bg: string; color: string }>

const qc = (q: string) => QUALITY_COLORS[q] ?? QUALITY_COLORS['not-yet']!

function WorksheetResult({ result }: { result: WorksheetOcr }) {
  return (
    <>
      <div style={card}>
        <span style={{ ...qc(result.overall_quality), display: 'inline-block', padding: '3px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
          {result.overall_quality}
        </span>
        <p style={{ fontSize: 16, color: '#222', margin: '0 0 8px' }}>{result.summary_en}</p>
        <p style={{ fontSize: 15, color: '#666', margin: 0 }}>{result.summary_zh}</p>
      </div>
      {result.questions.map((q) => (
        <div key={q.number} style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 16px' }}>
          <span style={{ ...qc(q.quality), padding: '2px 10px', borderRadius: 16, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {q.number}. {q.quality}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: '#222' }}>Wrote: <em>{q.transcript}</em></div>
            {q.misconception && <div style={{ fontSize: 13, color: '#888', marginTop: 3 }}>{q.misconception}</div>}
            {q.suggestion && <div style={{ fontSize: 13, color: '#1a6bb5', marginTop: 3 }}>{q.suggestion}</div>}
          </div>
        </div>
      ))}
    </>
  )
}

export const worksheetApp: CaptureApp<WorksheetOcr> = {
  id: 'worksheet',
  label: 'Worksheet',
  labelZh: '作业',
  icon: '📝',
  blurb: 'Graded against a rubric',
  paper: 'letter',
  waitHint: 'Usually 5–20 seconds',
  ResultView: WorksheetResult,
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }

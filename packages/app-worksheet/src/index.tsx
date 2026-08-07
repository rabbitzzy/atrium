/**
 * Worksheet — kiosk half.
 *
 * Owns how a graded worksheet presents itself: the picker entry, the Debrief
 * the student reads after submitting, and the same Debrief assembling itself
 * while the evaluation is still being written. The platform renders none of
 * this; it renders `app.ResultView` / `app.StreamView` and does not know what
 * a quality tier is.
 */

import type { CaptureApp, Partially, QualityTier } from '@atrium/schema'

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

type Question = WorksheetOcr['questions'][number]

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

/**
 * One question, however much of it has arrived.
 *
 * Every field is guarded rather than assumed, because this renders both a
 * finished evaluation and one mid-flight — and the streamed case is not a
 * lesser version of the row, it is the same row with fewer facts in it yet.
 * Nothing here ever changes once shown: the parser upstream only hands over
 * values that can no longer move.
 */
function QuestionRow({ q }: { q: Partially<Question> }) {
  return (
    <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 16px' }}>
      <span
        style={{
          ...qc(q.quality ?? ''),
          padding: '2px 10px',
          borderRadius: 16,
          fontSize: 12,
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        {q.number ?? '·'}
        {q.quality ? `. ${q.quality}` : ''}
      </span>
      <div style={{ flex: 1 }}>
        {q.transcript ? (
          <div style={{ fontSize: 14, color: '#222' }}>Wrote: <em>{q.transcript}</em></div>
        ) : (
          // The row exists before its content does. Holding the space is what
          // makes the Debrief grow downwards instead of reshuffling.
          <div style={{ fontSize: 14, color: '#ccc' }}>reading…</div>
        )}
        {q.misconception && <div style={{ fontSize: 13, color: '#888', marginTop: 3 }}>{q.misconception}</div>}
        {q.suggestion && <div style={{ fontSize: 13, color: '#1a6bb5', marginTop: 3 }}>{q.suggestion}</div>}
      </div>
    </div>
  )
}

function SummaryCard({ result }: { result: Partially<WorksheetOcr> }) {
  return (
    <div style={card}>
      {result.overall_quality && (
        <span style={{ ...qc(result.overall_quality), display: 'inline-block', padding: '3px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
          {result.overall_quality}
        </span>
      )}
      <p style={{ fontSize: 16, color: '#222', margin: '0 0 8px' }}>{result.summary_en}</p>
      <p style={{ fontSize: 15, color: '#666', margin: 0 }}>{result.summary_zh}</p>
    </div>
  )
}

function WorksheetResult({ result }: { result: WorksheetOcr }) {
  return (
    <>
      <SummaryCard result={result} />
      {result.questions.map((q) => (
        <QuestionRow key={q.number} q={q} />
      ))}
    </>
  )
}

/**
 * The evaluation as it is being written (BHCS-10).
 *
 * Questions first and the summary last, which is the order the schema pins and
 * the order that pays: the per-question feedback is what a student can act on,
 * so it is what should reach them at three seconds rather than at twenty. The
 * summary card appears only once it has words in it — an empty card sliding in
 * at the top would push everything the student was reading down the screen.
 *
 * Keyed by position, not by `q.number`: the number is itself a value that may
 * not have arrived, and a key that changes when it does would remount the row
 * the student is halfway through reading.
 */
function WorksheetStream({ partial }: { partial: Partially<WorksheetOcr> }) {
  return (
    <>
      {(partial.questions ?? []).map((q, i) => (
        <QuestionRow key={i} q={q} />
      ))}
      {(partial.summary_en || partial.overall_quality) && <SummaryCard result={partial} />}
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
  // Only ever seen before the first question lands, so it describes what is
  // about to happen rather than how long the whole thing takes.
  waitHint: 'Your answers will appear here as they are read',
  ResultView: WorksheetResult,
  StreamView: WorksheetStream,
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }

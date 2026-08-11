/**
 * Worksheet — kiosk half.
 *
 * Owns how a graded worksheet presents itself: the picker entry, the Debrief
 * the student reads after submitting, and the same Debrief assembling itself
 * while the evaluation is still being written. The platform renders none of
 * this; it renders `app.ResultView` / `app.StreamView` and does not know what
 * a quality tier is.
 */

import type { CaptureApp, CaptureContext, Partially, WaitLine } from '@atrium/schema'
import { qc } from './tiers'
import { worksheetSpeech } from './speech'

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
  const look = qc(q.quality ?? '')

  return (
    <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 16px' }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: '#bbb', minWidth: 22 }}>{q.number ?? '·'}</span>
      <div style={{ flex: 1 }}>
        {q.quality && (
          <span
            style={{
              background: look.bg,
              color: look.color,
              padding: '3px 12px',
              borderRadius: 16,
              fontSize: 13,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              display: 'inline-block',
              marginBottom: 6,
            }}
          >
            {look.emoji} {look.label} <span style={{ fontWeight: 600, opacity: 0.75 }}>{look.labelZh}</span>
          </span>
        )}
        {q.transcript ? (
          // "You wrote", not "Wrote". The Debrief is addressed to the child who
          // filled the page in, and a headless label reads like a case file.
          <div style={{ fontSize: 14, color: '#222' }}>You wrote 你写的: <em>{q.transcript}</em></div>
        ) : (
          // The row exists before its content does. Holding the space is what
          // makes the Debrief grow downwards instead of reshuffling.
          <div style={{ fontSize: 14, color: '#ccc' }}>reading…</div>
        )}
        {q.misconception && <div style={{ fontSize: 14, color: '#666', marginTop: 5 }}>{q.misconception}</div>}
        {q.suggestion && (
          <div style={{ fontSize: 14, color: '#1a6bb5', marginTop: 5, fontWeight: 500 }}>{q.suggestion}</div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ result }: { result: Partially<WorksheetOcr> }) {
  return (
    <div style={card}>
      {result.overall_quality && (
        <span
          style={{
            background: qc(result.overall_quality).bg,
            color: qc(result.overall_quality).color,
            display: 'inline-block',
            padding: '5px 14px',
            borderRadius: 20,
            fontSize: 15,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          {qc(result.overall_quality).emoji} {qc(result.overall_quality).label}{' '}
          <span style={{ fontWeight: 600, opacity: 0.75 }}>{qc(result.overall_quality).labelZh}</span>
        </span>
      )}
      <p style={{ fontSize: 16, color: '#222', margin: '0 0 8px' }}>{result.summary_en}</p>
      <p style={{ fontSize: 15, color: '#666', margin: 0 }}>{result.summary_zh}</p>
    </div>
  )
}

/**
 * Keyed by position, not by `q.number` — the same rule the streamed view
 * follows, for a different reason.
 *
 * A question number is not unique on a real worksheet. A page with two sections
 * numbers both of them from 1, and the model transcribes what it sees, so a
 * six-question page can legitimately arrive as 1-6 twice. Keying on it made
 * React drop half the rows: a child would read feedback for six answers on a
 * page where they had written twelve.
 *
 * Position is the honest key here. This array is a finished response that never
 * reorders or filters, so index identity is stable for as long as the row is on
 * screen.
 */
function WorksheetResult({ result }: { result: WorksheetOcr }) {
  return (
    <>
      <SummaryCard result={result} />
      {result.questions.map((q, i) => (
        <QuestionRow key={i} q={q} />
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

/**
 * What to say to this student while their page is being read.
 *
 * Everything here is true of the pipeline and says nothing about the paper —
 * the reading has not finished, and a compliment paid before it has is a
 * compliment that costs the real feedback its credibility. See
 * `kiosk/src/platform/WaitChat.tsx` for why the whole pool exists.
 *
 * The youngest readers get their own set. A first-grader waiting on a sentence
 * about "working down the page" is being handed a second reading task at the
 * exact moment they were promised a rest.
 */
function worksheetWaitChat({ student }: CaptureContext): WaitLine[] {
  const name = student.name.split(' ')[0] ?? student.name

  if (student.grade !== null && student.grade !== undefined && student.grade <= 1) {
    return [
      { en: `Got it, ${name}!`, zh: `收到啦，${name}！` },
      { en: 'I am reading your page now.', zh: '我正在读你的这一页。' },
      { en: 'One question at a time…', zh: '一题一题地看…' },
      { en: 'Almost ready!', zh: '快好了！' },
      { en: 'Thank you for waiting.', zh: '谢谢你等我。' },
    ]
  }

  return [
    { en: `Got your page, ${name}. Let me read it.`, zh: `拿到你的作业了，${name}，我来读一读。` },
    { en: 'Starting at the top…', zh: '从第一题开始…' },
    { en: 'I read every line rather than skimming — that is the slow part.', zh: '我每一行都读，不是扫一眼，所以会慢一点。' },
    { en: 'Working my way down the page.', zh: '正在一行行往下看。' },
    { en: 'Handwriting takes me a moment. Nearly there.', zh: '手写的字要多看一会儿，快好了。' },
    { en: 'Putting your Debrief together now.', zh: '正在整理你的反馈。' },
    { en: 'Still going — thanks for waiting.', zh: '还在看，谢谢你等我。' },
  ]
}

export const worksheetApp: CaptureApp<WorksheetOcr> = {
  id: 'worksheet',
  label: 'Worksheet',
  labelZh: '作业',
  icon: '📝',
  paper: 'letter',
  theme: { tint: '#fff3d1', accent: '#d98a00' },
  waitChat: worksheetWaitChat,
  // Only ever seen before the first question lands, so it describes what is
  // about to happen rather than how long the whole thing takes.
  waitHint: 'Your answers will appear here as they are read',
  ResultView: WorksheetResult,
  StreamView: WorksheetStream,
  /*
   * BHCS-15. Only the finished Debrief is ever spoken — there is no spoken
   * counterpart to `StreamView` and there should not be. Speech needs whole
   * sentences, and a voice that restarted every time another question landed
   * would be harder to follow than the wait it was covering. The stream is for
   * the eye; the audio is for after.
   */
  speech: worksheetSpeech,
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }

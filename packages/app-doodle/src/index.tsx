/**
 * Doodle — kiosk half.
 *
 * The conformance test for the contract: no extraction, no refinement, no
 * resolution step, one static card. If a future change makes an app this small
 * awkward to express, the contract has grown something it should not have.
 */

import type { CaptureApp, CaptureContext, WaitLine } from '@atrium/schema'

function DoodleResult() {
  return (
    <div style={card}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🎨</div>
      <strong>Saved</strong>
      <p style={{ margin: '6px 0 0', fontSize: 14, color: '#666' }}>
        Doodles are kept as-is — no grading, no feedback.
      </p>
    </div>
  )
}

/**
 * The shortest wait in the building — there is no extraction, only an upload —
 * so these lines mostly exist to say the thing the result card says too: this
 * one is not being marked. A child who thinks a drawing is about to be graded
 * draws differently, and the wait is where that worry would sit.
 */
function doodleWaitChat({ student }: CaptureContext): WaitLine[] {
  const name = student.name.split(' ')[0] ?? student.name

  return [
    { en: 'Ooh, art! Let me put this somewhere safe.', zh: '哇，画画！我给你收好。' },
    { en: `No marking here, ${name} — this one is just yours.`, zh: `这个不打分，${name}，画是你自己的。` },
    { en: 'Saving it to your folder…', zh: '正在放进你的文件夹…' },
    { en: 'Almost done — this one is quick.', zh: '马上好，这个很快。' },
  ]
}

export const doodleApp: CaptureApp<unknown> = {
  id: 'doodle',
  label: 'Doodle',
  labelZh: '涂鸦',
  icon: '🎨',
  paper: 'letter',
  theme: { tint: '#ffe4ec', accent: '#dd4f7d' },
  waitHint: 'Just saving this one',
  waitChat: doodleWaitChat,
  ResultView: DoodleResult,
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }

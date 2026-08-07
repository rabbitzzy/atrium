/**
 * Doodle — kiosk half.
 *
 * The conformance test for the contract: no extraction, no refinement, no
 * resolution step, one static card. If a future change makes an app this small
 * awkward to express, the contract has grown something it should not have.
 */

import type { CaptureApp } from '@atrium/schema'

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

export const doodleApp: CaptureApp<unknown> = {
  id: 'doodle',
  label: 'Doodle',
  labelZh: '涂鸦',
  icon: '🎨',
  blurb: 'Saved, not graded',
  paper: 'letter',
  waitHint: 'Just saving this one',
  ResultView: DoodleResult,
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }

/**
 * Chess notes — kiosk half.
 *
 * Renders the transcription as written. BHCS-11's board, where a student
 * confirms the moves the validator could not resolve, arrives here as the
 * optional `Resolve` step — inside this file, not inside the platform.
 */

import type { CaptureApp } from '@atrium/schema'

export interface ChessOcr {
  metadata: { white: string | null; black: string | null; date: string | null; result: string | null }
  moves: { n: number; w: string | null; b: string | null }[]
}

function ChessResult({ result }: { result: ChessOcr }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
        {result.metadata.white ?? '?'} vs {result.metadata.black ?? '?'}
      </div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
        {result.moves.length} move pairs transcribed{result.metadata.result ? ` · ${result.metadata.result}` : ''}
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto', fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.7 }}>
        {result.moves.map((m) => (
          <div key={m.n} style={{ display: 'flex', gap: 10 }}>
            <span style={{ color: '#aaa', width: 28, textAlign: 'right' }}>{m.n}.</span>
            <span style={{ width: 76 }}>{m.w ?? '—'}</span>
            <span>{m.b ?? '—'}</span>
          </div>
        ))}
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 12, color: '#999' }}>
        Transcribed verbatim — misspellings are preserved on purpose so the
        chess-karma validator can correct them against board state.
      </p>
    </div>
  )
}

export const chessApp: CaptureApp<ChessOcr> = {
  id: 'chess',
  label: 'Chess notes',
  labelZh: '棋谱',
  icon: '♟️',
  blurb: 'Moves transcribed verbatim',
  paper: 'halfLetter',
  waitHint: 'Usually 5–20 seconds',
  ResultView: ChessResult,
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }

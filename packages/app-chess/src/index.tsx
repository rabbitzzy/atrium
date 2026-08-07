/**
 * Chess notes — kiosk half.
 *
 * Shows the transcription and what it resolved to, side by side. Both, always:
 * a child who wrote `bc4` should see that the system read it as Bc4 and did not
 * silently decide they had written something else.
 *
 * The per-move status is the confidence signal BHCS-11 will threshold on to
 * decide which moves to stop and ask about. It is surfaced here already so the
 * signal is visible to whoever is standing at the station, rather than sitting
 * unread in a column until the board gets built.
 */

import type { CaptureApp } from '@atrium/schema'
import type { MoveStatus, ValidatedMove, ValidatedScoresheet } from '@atrium/chess-rules'

/**
 * How each status presents itself.
 *
 * `ok` is deliberately quiet — most moves on a good scoresheet are fine, and
 * decorating all of them would bury the two that are not.
 */
const STATUS_STYLE: Record<MoveStatus, { mark: string; color: string; label: string }> = {
  ok: { mark: '', color: '#bbb', label: 'read as written' },
  normalized: { mark: '~', color: '#1a6bb5', label: 'tidied up' },
  corrected: { mark: '!', color: '#c07000', label: 'corrected against the board' },
  inferred: { mark: '+', color: '#1a7a4a', label: 'only legal move' },
  missing: { mark: '·', color: '#aaa', label: 'nothing written' },
  failed: { mark: '✗', color: '#c04010', label: "couldn't be read" },
}

/** Statuses worth counting out loud, in the order a reader should meet them. */
const TALLY_ORDER: MoveStatus[] = ['ok', 'normalized', 'corrected', 'inferred', 'missing', 'failed']

function MoveRow({ move }: { move: ValidatedMove }) {
  const style = STATUS_STYLE[move.status]
  const changed = move.san !== null && move.san !== move.raw

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '1px 0' }}>
      <span style={{ color: '#bbb', width: 34, textAlign: 'right', flexShrink: 0 }}>
        {move.n}
        {move.side === 'white' ? '.' : '…'}
      </span>
      <span style={{ width: 60, color: changed ? '#999' : '#222', flexShrink: 0 }}>
        {move.raw ?? '—'}
      </span>
      {/* The arrow only appears when the system actually changed something,
          so a scan of the column finds the edits without reading every row. */}
      <span style={{ width: 16, color: '#ccc', flexShrink: 0 }}>{changed ? '→' : ''}</span>
      <span style={{ width: 66, fontWeight: changed ? 600 : 400, color: '#222', flexShrink: 0 }}>
        {move.san ?? '—'}
      </span>
      <span style={{ color: style.color, fontSize: 12 }} title={style.label}>
        {style.mark}
      </span>
    </div>
  )
}

function ChessResult({ result }: { result: ValidatedScoresheet }) {
  const { metadata, moves, counts } = result
  const needsLook = counts.corrected + counts.failed + counts.missing

  return (
    <div style={card}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
        {metadata.white ?? '?'} vs {metadata.black ?? '?'}
      </div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>
        {moves.length} moves read{metadata.result ? ` · ${metadata.result}` : ''}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, marginBottom: 12 }}>
        {TALLY_ORDER.filter((s) => counts[s] > 0).map((s) => (
          <span key={s} style={{ color: STATUS_STYLE[s].color }}>
            {counts[s]} {STATUS_STYLE[s].label}
          </span>
        ))}
      </div>

      <div style={{ maxHeight: 260, overflowY: 'auto', fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.6 }}>
        {moves.map((m) => (
          <MoveRow key={`${m.n}-${m.side}`} move={m} />
        ))}
      </div>

      <p style={{ margin: '12px 0 0', fontSize: 12, color: '#999' }}>
        {needsLook > 0
          ? `Transcribed verbatim, then checked against the board. ${needsLook} ${needsLook === 1 ? 'move needs' : 'moves need'} a second look.`
          : 'Transcribed verbatim, then checked against the board — every move is legal.'}
      </p>
    </div>
  )
}

export const chessApp: CaptureApp<ValidatedScoresheet> = {
  id: 'chess',
  label: 'Chess notes',
  labelZh: '棋谱',
  icon: '♟️',
  blurb: 'Moves checked against the board',
  paper: 'halfLetter',
  waitHint: 'Usually 5–20 seconds',
  ResultView: ChessResult,
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }

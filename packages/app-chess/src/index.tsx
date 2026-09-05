/**
 * Chess notes — kiosk half.
 *
 * Shows the transcription and what it resolved to, side by side. Both, always:
 * a child who wrote `bc4` should see that the system read it as Bc4 and did not
 * silently decide they had written something else.
 *
 * The per-move status drives two things: what is shown here, and which move
 * the `Resolve` step stops to ask about. A move a student settled themselves
 * is marked as theirs — the point is never to imply the machine read something
 * it did not.
 *
 * A page can also carry board diagrams instead of, or as well as, a move list
 * (BHCS-106), so both halves render independently and either may be absent.
 */

import { Suspense, lazy } from 'react'
import type { CaptureApp, CaptureContext, WaitLine } from '@atrium/schema'
// From the `/status` entry point, not the package root: the root pulls in
// chess.js, and this module is loaded by every student at the kiosk whether or
// not they came with a scoresheet.
import { isUncertain, type MoveStatus, type ValidatedMove } from '@atrium/chess-rules/status'
import type { BoardPosition, ValidatedScoresheet } from '@atrium/chess-rules'

/**
 * The board arrives only when a scoresheet actually needs one.
 *
 * `react-chessboard` and `chess.js` together are most of this app's weight,
 * and the student who came to submit a worksheet should not be downloading a
 * chessboard. Splitting here keeps the kiosk's first paint the size it was
 * before this feature existed; the chunk loads while the student is reading
 * "you wrote 6xb2".
 */
const LazyResolve = lazy(() => import('./Resolve').then((m) => ({ default: m.Resolve })))

/** The same bargain for the diagrams: no board until there is a board to draw. */
const LazyBoards = lazy(() => import('./Boards').then((m) => ({ default: m.Boards })))

function Resolve(props: {
  result: ValidatedScoresheet
  onResolved: (r: ValidatedScoresheet) => void
}) {
  return (
    <Suspense fallback={<div style={{ ...card, color: '#999' }}>Setting up the board…</div>}>
      <LazyResolve {...props} />
    </Suspense>
  )
}

function Boards({ boards }: { boards: BoardPosition[] }) {
  return (
    <Suspense fallback={<div style={{ ...card, color: '#999' }}>Setting up the position…</div>}>
      <LazyBoards boards={boards} />
    </Suspense>
  )
}

/**
 * How each status presents itself.
 *
 * `ok` is deliberately quiet — most moves on a good scoresheet are fine, and
 * decorating all of them would bury the two that are not.
 */
const STATUS_STYLE: Record<MoveStatus, { mark: string; color: string; label: string }> = {
  confirmed: { mark: '✓', color: '#1a7a4a', label: 'you confirmed' },
  ok: { mark: '', color: '#bbb', label: 'read as written' },
  normalized: { mark: '~', color: '#1a6bb5', label: 'tidied up' },
  corrected: { mark: '!', color: '#c07000', label: 'corrected against the board' },
  inferred: { mark: '+', color: '#1a7a4a', label: 'only legal move' },
  missing: { mark: '·', color: '#aaa', label: 'nothing written' },
  failed: { mark: '✗', color: '#c04010', label: "couldn't be read" },
}

/** Statuses worth counting out loud, in the order a reader should meet them. */
const TALLY_ORDER: MoveStatus[] = [
  'confirmed',
  'ok',
  'normalized',
  'corrected',
  'inferred',
  'missing',
  'failed',
]

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

function Game({ result }: { result: ValidatedScoresheet }) {
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

/**
 * The two halves of a chess page, each shown only if it is there.
 *
 * A sheet of puzzle diagrams has no game on it, and rendering the game card
 * anyway would greet that student with "? vs ?" and "0 moves read" — a result
 * screen reporting a failure at reading something they never handed in.
 * `boards` is defaulted rather than assumed for the same kind of reason: every
 * chess capture taken before BHCS-106 is stored without the field.
 */
function ChessResult({ result }: { result: ValidatedScoresheet }) {
  const boards = result.boards ?? []
  const hasGame = result.moves.length > 0 || boards.length === 0

  return (
    <>
      {hasGame && <Game result={result} />}
      {boards.length > 0 && <Boards boards={boards} />}
    </>
  )
}

/**
 * Waiting-room talk for a scoresheet.
 *
 * Two of these are doing more than filling silence. Saying that the moves are
 * being replayed on a board is what makes the result comprehensible when it
 * arrives — a student who was told that is not surprised that the machine has
 * an opinion about their move. And the line about being asked is a warning:
 * `needsResolve` may well interrupt in a few seconds, and an interruption
 * someone was told about lands as a question rather than as a failure.
 */
function chessWaitChat({ student }: CaptureContext): WaitLine[] {
  const name = student.name.split(' ')[0] ?? student.name

  return [
    { en: `A game, ${name}! Let me find the first move.`, zh: `一局棋，${name}！我先找第一步。` },
    { en: 'Setting the pieces up on my own board…', zh: '我先把棋子摆好…' },
    { en: 'Following White, then Black, then White again.', zh: '白方，黑方，再白方，一步步跟。' },
    { en: 'Chess handwriting is the tricky kind. Going slowly.', zh: '棋谱的字最难认，我慢慢来。' },
    { en: 'Replaying your game to check each move fits the position.', zh: '我在把这局棋走一遍，看每一步对不对得上。' },
    { en: 'If a move is hard to read, I will ask you about it in a second.', zh: '要是有一步看不清，等一下我问你。' },
    // Conditional on purpose. Nothing has been read yet, so this can promise
    // what the station will do with a diagram without claiming there is one.
    { en: 'If there is a board drawn here, I will write the position down too.', zh: '要是这页上画了棋盘，我也把局面记下来。' },
  ]
}

export const chessApp: CaptureApp<ValidatedScoresheet> = {
  id: 'chess',
  label: 'Chess notes',
  labelZh: '棋谱',
  icon: '♟️',
  paper: 'halfLetter',
  theme: { tint: '#e5ecff', accent: '#3f5fd6' },
  waitHint: 'Usually 5–20 seconds',
  waitChat: chessWaitChat,
  ResultView: ChessResult,

  /**
   * Only interrupt when there is something a student can actually settle.
   * A scoresheet that read cleanly goes straight to the result — the board is
   * a repair tool, not a ceremony.
   */
  needsResolve: (result) => result.moves.some(isUncertain),
  Resolve,
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }

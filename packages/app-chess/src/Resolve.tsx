/**
 * The stop-and-ask step (BHCS-11).
 *
 * Where the confidence signal from BHCS-12 turns into a question a child can
 * answer. The shape of the question follows the shape of the failure: real
 * scoresheets do not degrade move by move, they collapse at one cell and stay
 * collapsed, so this asks about the collapse and re-reads everything after it.
 *
 * Three rules it holds to:
 *
 *   - **Ask about the cause.** The first uncertain move, never the loudest one.
 *   - **Never rewrite the handwriting.** `raw` is shown back verbatim, beside
 *     the machine's guess, so the student is choosing rather than being told.
 *   - **Stop asking.** Three rounds and then it hands the rest to a teacher.
 *     A scoresheet needing confirmation every third move is worse than a plain
 *     transcription with a "check these" list at the end.
 */

import { useState } from 'react'
import { Chessboard } from 'react-chessboard'
import {
  applyAnswer,
  nextPrompt,
  unresolved,
  type ConfirmedMoves,
  type ValidatedScoresheet,
} from '@atrium/chess-rules'
import { countByStatus } from '@atrium/chess-rules'

/**
 * How many questions before falling back.
 *
 * Re-anchoring means one answer usually rescues a long tail, so this rarely
 * binds — but when a sheet is genuinely unreadable, the next student is
 * waiting and a teacher is the better answer.
 */
const MAX_ROUNDS = 3

export function Resolve({
  result,
  onResolved,
}: {
  result: ValidatedScoresheet
  onResolved: (r: ValidatedScoresheet) => void
}) {
  const [sheet, setSheet] = useState(result)
  const [rounds, setRounds] = useState(0)
  const [hint, setHint] = useState<string | null>(null)

  const prompt = rounds < MAX_ROUNDS ? nextPrompt(sheet.moves) : null

  function answer(san: string) {
    if (!prompt) return
    const next = applyAnswer(sheet.source, sheet.confirmed, prompt.key, san)
    const moves = next.moves
    const counts = countByStatus(moves)
    const settled = counts.confirmed + counts.ok + counts.normalized + counts.corrected + counts.inferred

    const rescued = unresolved(sheet.moves).length - unresolved(moves).length
    setHint(
      rescued > 1
        ? `Nice — that sorted out ${rescued} moves.`
        : rescued > 0
          ? 'Got it.'
          : 'Thanks — that one was tricky.',
    )
    setSheet({
      ...sheet,
      moves,
      confirmed: next.confirmed,
      counts,
      confidence: settled > 0 ? (counts.confirmed + counts.ok) / settled : 0,
    })
    setRounds(rounds + 1)
  }

  function skip() {
    // Skipping still costs a round. Otherwise a student can be walked through
    // every uncertain move on the sheet one Skip at a time, which is the
    // interaction this cap exists to prevent.
    setHint(null)
    setRounds(rounds + 1)
  }

  // Nothing left worth asking, or we have asked enough. Either way the student
  // is done and the result — with whatever they settled folded in — goes back
  // to the platform.
  if (!prompt) {
    const left = unresolved(sheet.moves).length
    return (
      <div style={card}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>♟️</div>
        <strong>{left === 0 ? 'Every move checks out' : 'Thanks for your help'}</strong>
        <p style={{ margin: '6px 0 12px', fontSize: 14, color: '#666' }}>
          {left === 0
            ? 'The whole game reads cleanly now.'
            : `${left} ${left === 1 ? 'move is' : 'moves are'} still unclear — a teacher will take a look.`}
        </p>
        <button onClick={() => onResolved(sheet)} style={primaryBtn}>
          See my game
        </button>
      </div>
    )
  }

  const highlights: Record<string, React.CSSProperties> = {}
  for (const option of prompt.options) {
    highlights[option.from] = { background: 'rgba(90,180,240,0.45)' }
    highlights[option.to] = { background: 'rgba(90,220,140,0.55)' }
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 2 }}>
        Move {prompt.n}, {prompt.side === 'white' ? 'White' : 'Black'} · question {rounds + 1} of{' '}
        {MAX_ROUNDS}
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>
        You wrote <span style={{ fontFamily: 'ui-monospace, monospace' }}>{prompt.raw}</span> — which
        move was that?
      </div>
      <div style={{ fontSize: 14, color: '#888', marginBottom: 14 }}>
        你写的是 <span style={{ fontFamily: 'ui-monospace, monospace' }}>{prompt.raw}</span>，是哪一步？
      </div>

      {hint && (
        <div style={{ fontSize: 14, color: '#1a7a4a', marginBottom: 12 }} role="status">
          {hint}
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/*
          The board is here to be looked at, not dragged on. A student who is
          unsure what they played is not helped by a blank canvas, and precise
          mouse-dragging is a poor ask of a six-year-old — so the pieces are
          fixed and the answer is a click.
        */}
        <div style={{ width: 300, flexShrink: 0 }}>
          <Chessboard
            position={prompt.fen}
            arePiecesDraggable={false}
            boardWidth={300}
            customSquareStyles={highlights}
            customBoardStyle={{ borderRadius: 8 }}
            onSquareClick={(square) => {
              const hit = prompt.options.find((o) => o.to === square)
              if (hit) answer(hit.san)
            }}
          />
          <p style={{ fontSize: 12, color: '#999', margin: '8px 0 0' }}>
            Green squares are where a piece could land. Tap one, or pick below.
          </p>
        </div>

        <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {prompt.options.map((option) => (
            <button
              key={option.san}
              onClick={() => answer(option.san)}
              style={{
                ...optionBtn,
                // The machine's own reading is offered first and marked, so the
                // student can agree with it in one tap when it was right.
                borderColor: option.san === prompt.guess ? '#1a1a2e' : '#d0cdc8',
              }}
            >
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 17, fontWeight: 600 }}>
                {option.san}
              </span>
              <span style={{ fontSize: 12, color: '#999' }}>
                {option.from} → {option.to}
                {option.san === prompt.guess ? ' · our guess' : ''}
              </span>
            </button>
          ))}
          <button onClick={skip} style={{ ...optionBtn, borderStyle: 'dashed', color: '#888' }}>
            <span style={{ fontSize: 14 }}>None of these / I’m not sure</span>
            <span style={{ fontSize: 12, color: '#aaa' }}>A teacher will check it</span>
          </button>
        </div>
      </div>
    </div>
  )
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
const primaryBtn: React.CSSProperties = { padding: '12px 24px', fontSize: 15, fontFamily: 'DM Sans, sans-serif', fontWeight: 600, borderRadius: 10, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer' }
const optionBtn: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '10px 14px', borderRadius: 10, border: '2px solid #d0cdc8', background: '#fff', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textAlign: 'left', width: '100%' }

/**
 * Positions read off the page (BHCS-106).
 *
 * The board is drawn back because a FEN is unreadable to a nine-year-old and
 * nearly unreadable to an adult: `2r3k1/5ppp/8/8/8/8/5PPP/2R3K1 w - - 0 1` is
 * either their puzzle or somebody else's and there is no way to tell by
 * looking. Set the pieces out again and a child can check it against the paper
 * in front of them in about two seconds. Same principle as the move list
 * showing `bc4 → Bc4`: show the reading, do not just assert it.
 *
 * Lazily loaded by index.tsx, like `Resolve`, so that a student submitting a
 * worksheet never downloads a chessboard.
 */

import { useState } from 'react'
import { Chessboard } from 'react-chessboard'
import type { BoardPosition } from '@atrium/chess-rules'

/**
 * One named tab for every analysis link on the page.
 *
 * `target="_blank"` opens a fresh tab per click, which on a nine-puzzle sheet
 * is nine tabs and nine drags. A *named* target reuses the same one, so a
 * teacher can park it beside the station in a split view and every board's
 * link then updates that pane in place — the thing a link cannot ask a browser
 * to do directly.
 *
 * It costs the implicit `noopener` that `_blank` carries: a named target is
 * ignored unless the opener relationship is allowed, so the analysis site gets
 * a `window.opener` handle back to this page. Accepted deliberately, for two
 * sites this app hardcodes and a station where the alternative is nine tabs.
 */
const ANALYSIS_TAB = 'atrium-analysis'

/**
 * Copy is offered, not assumed.
 *
 * The kiosk browser may not be on a secure origin, and `navigator.clipboard`
 * is simply absent when it is not. A button that silently does nothing is
 * worse than no button, so the FEN is always selectable text and the button
 * only appears when it can actually work.
 */
function CopyFen({ fen }: { fen: string }) {
  const [copied, setCopied] = useState(false)

  if (typeof navigator === 'undefined' || !navigator.clipboard) return null

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(fen).then(
          () => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
          },
          () => setCopied(false),
        )
      }}
      style={copyBtn}
    >
      {copied ? 'Copied ✓' : 'Copy'}
    </button>
  )
}

function Position({ position, n, many }: { position: BoardPosition; n: number; many: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ width: 168, flexShrink: 0 }}>
        <Chessboard
          position={position.fen}
          boardWidth={168}
          arePiecesDraggable={false}
          // Drawn the way the page was drawn. The notation is absolute either
          // way — this is so a child comparing the screen to their paper is
          // comparing two pictures of the same thing.
          boardOrientation={position.orientation}
          customBoardStyle={{ borderRadius: 6 }}
        />
      </div>

      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
          {position.label ?? (many ? `Position ${n}` : 'The position')}
        </div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
          {position.pieces} {position.pieces === 1 ? 'piece' : 'pieces'} ·{' '}
          {position.fen.split(' ')[1] === 'b' ? 'Black to move' : 'White to move'}
          {position.orientation === 'black' ? ' · drawn from Black’s side' : ''}
        </div>

        {/*
          The deliverable. Monospace, wrapping on the spaces between the FEN's
          own fields rather than mid-rank, and selectable whether or not the
          copy button is available.
        */}
        <div style={fenBox}>{position.fen}</div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <CopyFen fen={position.fen} />
          <a href={position.lichess} target={ANALYSIS_TAB} style={link}>
            {position.legal ? 'Open in lichess' : 'Open in the lichess editor'}
          </a>
          {/* chess.com's analysis board wants a position a game could be in;
              offering it one that is not would be sending a child to an error
              page. */}
          {position.legal && (
            <a href={position.chessCom} target={ANALYSIS_TAB} style={link}>
              Open in chess.com
            </a>
          )}
        </div>

        {position.problems.length > 0 && (
          <ul style={problemList}>
            {position.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function Boards({ boards }: { boards: BoardPosition[] }) {
  const many = boards.length > 1

  return (
    <div style={card}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
        {many ? `${boards.length} positions on this page` : 'A position on this page'}
      </div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 14 }}>
        棋盘上的局面 · in the notation lichess and chess.com both read
      </div>
      {/*
        Said out loud, because it is true and the student is the only one who
        can check it. Reading a diagram is harder than reading a move list —
        a piece a column off, or a bishop taken for a pawn, produces a position
        that looks entirely plausible and has nothing downstream to catch it.
        Drawing the board back is what makes that checkable in two seconds;
        this is the sentence that asks for the two seconds.
      */}
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#666' }}>
        Have a look at each board and check it against your page. 看看和你纸上的一样吗。
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {boards.map((position, i) => (
          <Position key={position.fen + i} position={position} n={i + 1} many={many} />
        ))}
      </div>
    </div>
  )
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
const fenBox: React.CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 12, lineHeight: 1.5, color: '#222', background: '#f6f5f3', border: '1px solid #e6e3de', borderRadius: 8, padding: '8px 10px', overflowWrap: 'anywhere', userSelect: 'all' }
const copyBtn: React.CSSProperties = { padding: '6px 12px', fontSize: 13, fontFamily: 'DM Sans, sans-serif', fontWeight: 600, borderRadius: 8, border: '1px solid #d0cdc8', background: '#fff', color: '#1a1a2e', cursor: 'pointer' }
const link: React.CSSProperties = { fontSize: 13, color: '#3f5fd6', textDecoration: 'none', fontWeight: 500 }
const problemList: React.CSSProperties = { margin: '10px 0 0', padding: '0 0 0 18px', fontSize: 12, color: '#c07000', lineHeight: 1.6 }

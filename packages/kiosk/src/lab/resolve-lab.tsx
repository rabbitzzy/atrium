/**
 * Chess resolution lab — dev only.
 *
 * The resolution step is otherwise unreachable without a printed scoresheet, a
 * camera, and a Gemini call, which makes it the hardest part of the kiosk to
 * look at while changing it. This mounts it directly against a fixture.
 *
 * The fixture is the King's Land game with move 3 misread as `Rc1` — a garble
 * that resolves to a legal but *wrong* move, so the board desyncs and roughly
 * half the game collapses into guesses. Answering `Bc4` should restore it.
 *
 * Same pattern as focus-lab.html. Not part of the kiosk app; nothing imports it.
 */

import { createRoot } from 'react-dom/client'
import { chessApp } from '@atrium/app-chess'
import { validateScoresheet, unresolved, type ValidatedScoresheet } from '@atrium/chess-rules'

const SCORESHEET = [
  { n: 1, w: 'e4', b: 'e5' },
  { n: 2, w: 'Nf3', b: 'Nc6' },
  { n: 3, w: 'Rc1', b: 'b5' }, // misread: really Bc4
  { n: 4, w: 'Bb3', b: 'NVH6' },
  { n: 5, w: '0-0', b: 'b4' },
  { n: 6, w: 'A3', b: 'Ba6' },
  { n: 7, w: 'c4', b: 'bxc3' },
  { n: 8, w: 'd3', b: '6xb2' },
  { n: 9, w: 'Bb2', b: 'Nd4' },
  { n: 10, w: 'Nxd4', b: 'exd4' },
  { n: 11, w: 'Bxd4', b: 'Bd6' },
  { n: 12, w: 'Nc3', b: 'Qh4' },
  { n: 13, w: 'g3', b: 'Qh3' },
  { n: 14, w: 'Nd5', b: 'Ng4' },
  { n: 15, w: 'Re1', b: 'Qh2+' },
]

const start = validateScoresheet({
  metadata: { white: 'Chris', black: 'Arthur', date: null, result: '1-0' },
  moves: SCORESHEET,
})

function report(sheet: ValidatedScoresheet, label: string) {
  const el = document.getElementById('state')!
  el.textContent = [
    label,
    `confidence  ${sheet.confidence.toFixed(3)}`,
    `unresolved  ${unresolved(sheet.moves).length} of ${sheet.moves.length}`,
    `confirmed   ${JSON.stringify(sheet.confirmed)}`,
    `counts      ${JSON.stringify(sheet.counts)}`,
  ].join('\n')
}

report(start, 'before answering')

const root = createRoot(document.getElementById('root')!)

function show(sheet: ValidatedScoresheet) {
  const Resolve = chessApp.Resolve!
  root.render(
    <Resolve
      result={sheet}
      onResolved={(resolved) => {
        report(resolved, 'resolved — this is what would be stored')
        root.render(<chessApp.ResultView result={resolved} student={{ id: 'lab', name: 'Lab' }} />)
      }}
    />,
  )
}

show(start)

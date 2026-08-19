/**
 * "Get my Card" — the start of the loop, from the child's side.
 *
 * Until now a student could scan work and never be given any. This is the one
 * button that makes the flywheel a circle: it asks the planner what they should
 * work on, spends a Leaf, and puts paper in the tray.
 *
 * ── Every state is a sentence, not a status ──
 *
 * There are five ways this ends and a seven-year-old has to understand all of
 * them without an adult. None of them may read as a refusal or a fault:
 *
 *   printed        — here it comes, and here is what it costs
 *   no Leaves      — turn in a Card and you'll have one; two ways out named
 *   nothing to do  — everything is finished, or a teacher should look first
 *   no paper       — the machine's problem, said as the machine's problem,
 *                    and no Leaf was spent
 *   spent and lost — the one case that needs an adult, and it says so plainly
 *
 * That last one is the honest cost of there being no refund path (BHCS-38,
 * BHCS-67). If a Leaf is spent and the paper does not arrive, the child is told
 * to fetch a teacher rather than to press the button again — pressing again
 * would cost them a second Leaf for the same Card, which is the worst outcome
 * available and exactly what an impatient child would do.
 *
 * The wording comes from `lib/leaves.ts`, which is where the tone is tested.
 */

import { useState } from 'react'
import type { Student } from '@atrium/schema'
import { leafLook, spentLine } from '../lib/leaves'

type Outcome =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'printed'; leavesLeft: number }
  | { kind: 'no-leaves'; balance: number }
  | { kind: 'nothing-to-do' }
  | { kind: 'no-paper' }
  | { kind: 'spent-and-lost' }

export default function GetCard({
  student,
  onPrinted,
}: {
  student: Student
  onPrinted?: () => void
}) {
  const [state, setState] = useState<Outcome>({ kind: 'idle' })

  async function ask() {
    setState({ kind: 'working' })
    try {
      const res = await fetch('/api/card', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ studentId: student.id }),
      })
      const body = (await res.json()) as {
        error?: string
        balance?: number
        leavesLeft?: number
        spentLeaf?: boolean
      }

      if (res.ok) {
        setState({ kind: 'printed', leavesLeft: body.leavesLeft ?? 0 })
        onPrinted?.()
        return
      }
      if (res.status === 402) return setState({ kind: 'no-leaves', balance: body.balance ?? 0 })
      if (res.status === 409) return setState({ kind: 'nothing-to-do' })
      // Everything else splits on the only question that matters to the child:
      // did this cost them something?
      setState(body.spentLeaf ? { kind: 'spent-and-lost' } : { kind: 'no-paper' })
    } catch {
      setState({ kind: 'no-paper' })
    }
  }

  if (state.kind === 'idle' || state.kind === 'working') {
    return (
      <button type="button" style={primary} onClick={ask} disabled={state.kind === 'working'}>
        {state.kind === 'working' ? (
          <>Getting your Card… <span style={sub}>正在准备…</span></>
        ) : (
          <>🌿 Get my Card <span style={sub}>拿一张练习卡</span></>
        )}
      </button>
    )
  }

  const again = (
    <button type="button" style={secondary} onClick={() => setState({ kind: 'idle' })}>
      OK
    </button>
  )

  if (state.kind === 'printed') {
    const line = spentLine(state.leavesLeft)
    return (
      <Panel tone="#4a7c59">
        <b style={{ fontSize: 19 }}>{line.en}</b>
        <span style={zh}>{line.zh}</span>
        <span style={{ fontSize: 14, color: '#5a5a6a' }}>
          Take it from the printer and find a pencil. 从打印机上拿走，找一支铅笔。
        </span>
        {again}
      </Panel>
    )
  }

  if (state.kind === 'no-leaves') {
    const look = leafLook(state.balance)
    return (
      <Panel tone={look.color}>
        <b style={{ fontSize: 19 }}>{look.speech.en[0]}</b>
        <span style={zh}>{look.speech.zh[0]}</span>
        {look.waysOut.map((w) => (
          <span key={w.en} style={{ fontSize: 14.5, color: '#5a5a6a' }}>
            · {w.en} <span style={{ opacity: 0.7 }}>{w.zh}</span>
          </span>
        ))}
        {again}
      </Panel>
    )
  }

  if (state.kind === 'nothing-to-do') {
    return (
      <Panel tone="#4a7c59">
        <b style={{ fontSize: 19 }}>Nothing new for you right now.</b>
        <span style={zh}>现在没有新的练习卡。</span>
        <span style={{ fontSize: 14, color: '#5a5a6a' }}>
          Ask your teacher what to do next. 问问老师接下来做什么。
        </span>
        {again}
      </Panel>
    )
  }

  if (state.kind === 'no-paper') {
    return (
      <Panel tone="#c8963e">
        <b style={{ fontSize: 19 }}>The printer isn't ready.</b>
        <span style={zh}>打印机还没准备好。</span>
        <span style={{ fontSize: 14, color: '#5a5a6a' }}>
          You still have all your Leaves — nothing was used. Tell a teacher and try again after.
          <br />
          你的叶子一片都没少。告诉老师，等一下再试。
        </span>
        {again}
      </Panel>
    )
  }

  return (
    <Panel tone="#b4432f">
      <b style={{ fontSize: 19 }}>Something went wrong after your Leaf was used.</b>
      <span style={zh}>用掉叶子之后出了点问题。</span>
      <span style={{ fontSize: 14, color: '#5a5a6a' }}>
        Please tell a teacher — don't press the button again, or it will use another Leaf.
        <br />
        请告诉老师，先别再按一次，不然会再用掉一片叶子。
      </span>
      {again}
    </Panel>
  )
}

function Panel({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <div style={{ ...panel, borderColor: tone }}>
      {children}
    </div>
  )
}

const primary: React.CSSProperties = {
  padding: '18px 30px',
  fontSize: 21,
  fontWeight: 700,
  fontFamily: 'DM Sans, sans-serif',
  borderRadius: 16,
  border: 'none',
  background: '#4a7c59',
  color: '#fff',
  cursor: 'pointer',
  boxShadow: '0 6px 18px rgba(74,124,89,0.28)',
}
const secondary: React.CSSProperties = {
  alignSelf: 'flex-start',
  marginTop: 4,
  padding: '10px 22px',
  fontSize: 16,
  fontWeight: 700,
  fontFamily: 'DM Sans, sans-serif',
  borderRadius: 12,
  border: '2px solid #d0cdc8',
  background: '#fff',
  color: '#1a1a2e',
  cursor: 'pointer',
}
const panel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
  padding: '20px 24px',
  borderRadius: 16,
  border: '2px solid',
  background: '#fff',
  fontFamily: 'DM Sans, sans-serif',
  color: '#1a1a2e',
  maxWidth: 520,
}
const sub: React.CSSProperties = { fontWeight: 600, opacity: 0.8, fontSize: 17 }
const zh: React.CSSProperties = { fontSize: 16, color: '#3a3a4a' }

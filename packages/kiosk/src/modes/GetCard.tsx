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
import { beginBusy } from '../lib/busy'
import { PrintAgentUnreachable, printCard, trayState } from '../lib/printer'
import SimulateCard from './SimulateCard'
import Preparing from './Preparing'

/**
 * Tell the server how the printing went, and never wait on it.
 *
 * The child already has their answer on screen by the time this runs. A station
 * that cannot reach the route must not turn a printing problem into a second
 * failure, so this deliberately has no error path and nothing awaits it.
 */
function report(outcome: {
  studentId: string
  taskId: string | null
  ok: boolean
  jobId?: string | null
  failure?: string
  detail?: string
}) {
  void fetch('/api/print-outcome', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(outcome),
  }).catch(() => {})
}

/**
 * Four doors, all the same size.
 *
 * This was a big default button with the three subjects folded behind an "or
 * pick a subject" link. Defensible on paper — the planner's own choice is
 * better informed than a child's — and wrong in front of a six-year-old, who
 * has to read a link, understand it offers something, tap it, and only then
 * choose. Two taps and a disclosure to answer a question they already had an
 * answer to.
 *
 * Flat, the whole thing is one decision: which of these four. The planner's
 * pick did not disappear, it became a door like the others and got a name a
 * child can want to press.
 *
 * Choosing a door is still not choosing a difficulty. The Blueprint picks the
 * Room behind each one, so nobody can opt into easy work — that division is
 * what made this safe to hand over in the first place and none of it changes by
 * flattening the menu.
 *
 * A clover for luck because it is also a leaf, which is the token this whole
 * economy is denominated in.
 */
const DOORS = [
  { id: 'math', en: 'Math', zh: '数学', emoji: '🔢' },
  { id: 'lang/zh', en: 'Chinese', zh: '中文', emoji: '🀄' },
  { id: 'lang/en', en: 'English', zh: '英语', emoji: '📖' },
  // No subject: the planner ranks the whole Blueprint, which is what it did
  // before any of this existed.
  { id: null, en: "I'm lucky", zh: '碰运气', emoji: '🍀' },
] as const

type Outcome =
  | { kind: 'idle' }
  /** Carries the door they pressed, so the wait can name it back to them. */
  | { kind: 'working'; subject?: string }
  | { kind: 'printed'; leavesLeft: number }
  | { kind: 'preview'; taskId: string; html: string; leavesLeft: number }
  | { kind: 'nothing-in-subject'; subject: string }
  | { kind: 'no-leaves'; balance: number; bootstrapped: boolean }
  | { kind: 'nothing-to-do' }
  | { kind: 'no-paper' }
  | { kind: 'spent-and-lost' }

export default function GetCard({
  student,
  onPrinted,
  trailing,
}: {
  student: Student
  onPrinted?: () => void
  /** Rendered inside the doors row, behind a rule — the way out of this mode. */
  trailing?: React.ReactNode
}) {
  const [state, setState] = useState<Outcome>({ kind: 'idle' })
  // Set from the admin surface. Off means paper, which is the real thing.
  const simulate = localStorage.getItem('atrium.simulate') === 'on'

  /**
   * The Card is here and the Leaf is gone. Get it onto paper.
   *
   * Everything past this point costs the child the same whatever goes wrong, so
   * the two outcomes on screen are the two that mean different things to them:
   * paper came out, or it did not and that was not free. The distinction
   * between a printer that refused and one that could not be found matters to
   * whoever fixes it, not to the seven-year-old, so it travels in the report
   * rather than onto the screen.
   */
  async function printReturnedCard(res: Response) {
    const taskId = res.headers.get('x-atrium-task-id')
    const leavesLeft = Number(res.headers.get('x-atrium-leaves') ?? '0')
    const pdf = await res.blob()

    // Held jobs let the whole loop be exercised without spending paper. Set at
    // the station, the way simulate mode is.
    const hold = localStorage.getItem('atrium.holdPrints') === 'on'

    try {
      const { jobId } = await printCard(pdf, {
        title: `Atrium Card ${(taskId ?? '').slice(0, 8)}`,
        ...(hold ? { hold: true } : {}),
      })
      report({ studentId: student.id, taskId, ok: true, jobId })
      setState({ kind: 'printed', leavesLeft })
    } catch (err) {
      report({
        studentId: student.id,
        taskId,
        ok: false,
        failure: err instanceof PrintAgentUnreachable ? 'unreachable' : 'refused',
        detail: err instanceof Error ? err.message : '',
      })
      setState({ kind: 'spent-and-lost' })
    }
  }

  async function ask(subject?: string) {
    setState(subject ? { kind: 'working', subject } : { kind: 'working' })
    /*
     * The whole request is a declared wait (`lib/busy.ts`). Without it a
     * generation slow enough to cross four minutes — a stalled model call, a
     * printer queued behind another child's job — lets the idle timer ask
     * "still here?" and then end the visit, while the request is still running
     * and about to spend a Leaf on a student the station has forgotten.
     */
    const done = beginBusy()
    try {
      /*
       * The tray, before the Leaf.
       *
       * This check used to be the first thing `POST /api/card` did, and it has
       * to stay first wherever it lives: generating spends the Leaf and there is
       * no refund path, so refusing here is the only refusal that costs a child
       * nothing. It runs from the browser now because the print agent is on this
       * machine's LAN and the API route no longer is (`lib/printer.ts`).
       *
       * Simulate mode has no tray to check.
       */
      if (!simulate) {
        const tray = await trayState()
        if (!tray || !tray.ready) return setState({ kind: 'no-paper' })
      }

      const res = await fetch('/api/card', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          studentId: student.id,
          ...(subject ? { subject } : {}),
          ...(simulate ? { preview: true } : {}),
        }),
      })

      /*
       * A Card comes back as a PDF and everything else comes back as JSON, so
       * the content type is what says which happened. Reading the body the
       * wrong way here would turn a successful Card into a parse error after
       * the Leaf had already been spent.
       */
      if (res.ok && res.headers.get('content-type')?.includes('application/pdf')) {
        onPrinted?.()
        return printReturnedCard(res)
      }

      const body = (await res.json()) as {
        error?: string
        balance?: number
        leavesLeft?: number
        spentLeaf?: boolean
      }

      if (res.ok) {
        onPrinted?.()
        const b = body as unknown as { html?: string; taskId?: string }
        if (b.html && b.taskId) {
          return setState({
            kind: 'preview',
            taskId: b.taskId,
            html: b.html,
            leavesLeft: body.leavesLeft ?? 0,
          })
        }
        setState({ kind: 'printed', leavesLeft: body.leavesLeft ?? 0 })
        return
      }
      if (res.status === 402) {
        // Zero because they spent them, or zero because nobody has placed them?
        // Only one of those is fixed by turning in a Card.
        const leaves = await fetch(`/api/leaves?studentId=${encodeURIComponent(student.id)}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
        return setState({
          kind: 'no-leaves',
          balance: body.balance ?? 0,
          bootstrapped: leaves?.bootstrapped !== false,
        })
      }
      if (res.status === 409) {
        return subject
          ? setState({ kind: 'nothing-in-subject', subject })
          : setState({ kind: 'nothing-to-do' })
      }
      // Everything else splits on the only question that matters to the child:
      // did this cost them something?
      setState(body.spentLeaf ? { kind: 'spent-and-lost' } : { kind: 'no-paper' })
    } catch {
      setState({ kind: 'no-paper' })
    } finally {
      done()
    }
  }

  if (state.kind === 'preview') {
    return (
      <SimulateCard
        student={student}
        taskId={state.taskId}
        html={state.html}
        leavesLeft={state.leavesLeft}
        onDone={() => {
          onPrinted?.()
          setState({ kind: 'idle' })
        }}
      />
    )
  }

  if (state.kind === 'idle' || state.kind === 'working') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        {/*
          Over everything, not merely disabling these four. The header still
          offers My work, What I know and the name chip during a wait, and the
          last of those ends the visit outright while the request keeps running.
        */}
        {state.kind === 'working' && (
          <Preparing {...(state.subject ? { subject: state.subject } : {})} simulate={simulate} />
        )}
        <div style={{ fontSize: 15, fontWeight: 600, color: '#5a5a6a' }}>
          What shall we work on? <span style={{ opacity: 0.75 }}>今天做什么？</span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {DOORS.map((d) => (
            <button
              key={d.en}
              type="button"
              style={door}
              onClick={() => ask(d.id ?? undefined)}
              disabled={state.kind === 'working'}
            >
              <span style={{ fontSize: 26 }} aria-hidden>{d.emoji}</span>
              <span>{d.en}</span>
              <span style={{ fontSize: 13.5, opacity: 0.75, fontWeight: 600 }}>{d.zh}</span>
            </button>
          ))}
          {trailing && (
            <>
              <div style={rule} aria-hidden />
              {trailing}
            </>
          )}
        </div>

        {simulate && (
          <span style={{ fontSize: 12, color: '#8a7a45' }}>
            simulate mode — no paper will be used
          </span>
        )}
      </div>
    )
  }

  const again = (
    <button type="button" style={secondary} onClick={() => setState({ kind: 'idle' })}>
      OK
    </button>
  )

  if (state.kind === 'nothing-in-subject') {
    const s = DOORS.find((x) => x.id === state.subject)
    return (
      <Panel tone="#4a7c59">
        <b style={{ fontSize: 19 }}>
          You&rsquo;ve finished everything in {s?.en ?? 'that subject'} for now.
        </b>
        <span style={zh}>「{s?.zh ?? ''}」暂时没有新内容了。</span>
        <span style={{ fontSize: 14, color: '#5a5a6a' }}>
          Try another subject, or press Get my Card and I&rsquo;ll choose.
          <br />
          换一个科目，或者按「拿一张练习卡」，我来挑。
        </span>
        {again}
      </Panel>
    )
  }

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
    const look = leafLook(state.balance, state.bootstrapped)
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
/**
 * All four identical, which is the point — a child reading four buttons of the
 * same size is choosing, not being steered and then offered an escape.
 */
/** Separates the four doors from the way out, which is a different kind of answer. */
const rule: React.CSSProperties = {
  width: 1,
  alignSelf: 'stretch',
  background: '#d0cdc8',
  margin: '4px 2px',
}
const door: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
  padding: '16px 14px', minWidth: 116,
  fontFamily: 'DM Sans, sans-serif', fontSize: 18, fontWeight: 700,
  borderRadius: 18, border: '2px solid #4a7c59', background: '#fff',
  color: '#1a1a2e', cursor: 'pointer',
  boxShadow: '0 3px 10px rgba(74,124,89,0.14)',
}
const zh: React.CSSProperties = { fontSize: 16, color: '#3a3a4a' }

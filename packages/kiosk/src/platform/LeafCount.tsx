/**
 * The Leaf count, always on screen (BHCS-40).
 *
 * A gate nobody can see is just a thing that stops working for no reason. This
 * sits in the header beside the name chip, small and permanent, the way a
 * currency indicator does in a game — so that when a Card costs a Leaf the
 * child has already watched the number all Visit and the cost is a fact about
 * the world rather than a surprise.
 *
 * All the wording and every colour comes from `lib/leaves.ts`, which is where
 * the tone can be argued with in a test. This file only places it.
 *
 * It polls rather than being told. The balance changes from two places the
 * kiosk does not own — a Card printing, and the grader awarding on submission
 * — and a number that lags the world by a few seconds is a much smaller
 * problem than a number that lags it until the next screen change. `refreshKey`
 * lets a caller that just did something say so and skip the wait.
 */

import { useEffect, useState } from 'react'
import type { Student } from '@atrium/schema'
import { leafLook } from '../lib/leaves'

const POLL_MS = 20000

export default function LeafCount({
  student,
  refreshKey = 0,
}: {
  student: Student
  refreshKey?: number
}) {
  const [balance, setBalance] = useState<number | null>(null)
  const [bootstrapped, setBootstrapped] = useState(true)

  useEffect(() => {
    let live = true
    const read = () =>
      fetch(`/api/leaves?studentId=${encodeURIComponent(student.id)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: { balance?: number; bootstrapped?: boolean }) => {
          if (!live) return
          setBalance(d.balance ?? 0)
          setBootstrapped(d.bootstrapped !== false)
        })
        .catch(() => undefined)

    read()
    const timer = setInterval(read, POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [student.id, refreshKey])

  // Nothing until it is known. A balance that flashes 0 and then corrects
  // itself would tell a child they are out of Leaves when they are not.
  if (balance === null) return null

  const look = leafLook(balance, bootstrapped)
  const zero = balance === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <div style={{ ...chip, borderColor: look.color, color: look.color }}>
        <span aria-hidden>{look.glyph}</span>
        <span>{look.labelEn}</span>
        <span style={{ opacity: 0.7, fontWeight: 500 }}>{look.labelZh}</span>
      </div>

      {look.hintEn && (
        <div style={{ ...hint, color: look.color }}>
          {look.hintEn} <span style={{ opacity: 0.75 }}>{look.hintZh}</span>
        </div>
      )}

      {/*
        The two doors, and only at zero. `eco-design.md` gives both, and naming
        them is what turns a dead end into an instruction — a child who can see
        only that they are stuck fetches an adult to say the machine is broken.
      */}
      {zero && (
        <div style={ways}>
          {look.waysOut.map((w) => (
            <div key={w.en}>
              · {w.en} <span style={{ opacity: 0.7 }}>{w.zh}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const chip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '6px 12px',
  borderRadius: 999,
  border: '2px solid',
  background: '#fff',
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 15,
  fontWeight: 700,
  whiteSpace: 'nowrap',
}
const hint: React.CSSProperties = {
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 12,
  fontWeight: 500,
  textAlign: 'right',
  maxWidth: 260,
}
const ways: React.CSSProperties = {
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 11.5,
  lineHeight: 1.5,
  color: '#6b6a75',
  textAlign: 'right',
  maxWidth: 260,
}

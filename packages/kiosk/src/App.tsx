import { useCallback, useEffect, useState } from 'react'
import type { Student } from '@atrium/schema'
import Admin from './modes/Admin'
import CheckIn from './modes/CheckIn'
import Capture from './modes/Capture'
import StillHere from './platform/StillHere'

/**
 * Two screens: name, then camera.
 *
 * There was a chat landing page between them, but it was a stub — a canned
 * greeting, a Send button wired to nothing, and a print link to an endpoint
 * that does not exist. A screen that only offers a way past itself is a tap,
 * not a step, so checking in now lands on the thing the station is for.
 */
export type KioskMode = 'checkin' | 'capture'

/**
 * Hash-based, so the data viewer needs no router dependency and no SPA
 * rewrite rules — #admin works identically on the dev server and on Vercel.
 */
function useIsAdminRoute(): boolean {
  const [isAdmin, setIsAdmin] = useState(() => window.location.hash.startsWith('#admin'))
  useEffect(() => {
    const sync = () => setIsAdmin(window.location.hash.startsWith('#admin'))
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  return isAdmin
}

export default function App() {
  const isAdmin = useIsAdminRoute()
  const [mode, setMode] = useState<KioskMode>('checkin')
  const [student, setStudent] = useState<Student | null>(null)

  if (isAdmin) return <Admin />

  function handleCheckIn(s: Student) {
    setStudent(s)
    setMode('capture')
  }

  /*
   * The end of a visit, however it is reached — the student pressing "not me",
   * the next child answering "someone else", or nobody answering at all. All
   * three land here, because to this station they are the same event: the
   * person whose name is on the screen is no longer the person in front of it.
   *
   * "Check out" as a distinct act is gone. It described something children
   * never did (see BHCS-18), and keeping a word for it only made the two paths
   * that do get used look like two different features.
   */
  const handleSwitchStudent = useCallback(() => {
    setStudent(null)
    setMode('checkin')
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {mode === 'checkin' && <CheckIn onCheckIn={handleCheckIn} />}
      {mode === 'capture' && student && (
        <>
          <Capture student={student} onSwitchStudent={handleSwitchStudent} />
          {/*
            Outside Capture rather than inside it, for the same reason My Work
            is inside it: this must not unmount the camera. It sits over
            whatever screen the visit reached — live view, Debrief, folder —
            and none of those need to know it exists.
          */}
          <StillHere student={student} onLeave={handleSwitchStudent} />
        </>
      )}
    </div>
  )
}

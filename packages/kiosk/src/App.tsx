import { useEffect, useState } from 'react'
import type { Student } from '@atrium/schema'
import Admin from './modes/Admin'
import CheckIn from './modes/CheckIn'
import Chat from './modes/Chat'
import Capture from './modes/Capture'
import ScanSubmit from './modes/ScanSubmit'

export type KioskMode = 'checkin' | 'chat' | 'capture' | 'scan'

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
    setMode('chat')
  }

  function handleCheckOut() {
    setStudent(null)
    setMode('checkin')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {mode === 'checkin' && <CheckIn onCheckIn={handleCheckIn} />}
      {mode === 'chat' && student && (
        <Chat
          student={student}
          onScan={() => setMode('capture')}
          onCheckOut={handleCheckOut}
        />
      )}
      {mode === 'capture' && student && (
        <Capture student={student} onDone={() => setMode('chat')} onCheckOut={handleCheckOut} />
      )}
      {/* Legacy single-purpose worksheet flow, kept while the Python evaluator
          is still the path of record for the Leaf-earning submission loop. */}
      {mode === 'scan' && student && (
        <ScanSubmit student={student} onDone={() => setMode('chat')} onCheckOut={handleCheckOut} />
      )}
    </div>
  )
}

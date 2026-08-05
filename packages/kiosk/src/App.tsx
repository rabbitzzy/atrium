import { useState } from 'react'
import CheckIn from './modes/CheckIn'
import Chat from './modes/Chat'
import Capture from './modes/Capture'
import ScanSubmit from './modes/ScanSubmit'

export type KioskMode = 'checkin' | 'chat' | 'capture' | 'scan'

/** nameZh is optional: the BHCS roster carries first/last name only today. */
export type Student = { id: string; name: string; nameZh?: string }

export default function App() {
  const [mode, setMode] = useState<KioskMode>('checkin')
  const [student, setStudent] = useState<Student | null>(null)

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

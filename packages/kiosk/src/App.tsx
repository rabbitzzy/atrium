import { useState } from 'react'
import CheckIn from './modes/CheckIn'
import Chat from './modes/Chat'
import ScanSubmit from './modes/ScanSubmit'

export type KioskMode = 'checkin' | 'chat' | 'scan'
export type Student = { id: string; name: string; nameZh: string }

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
      {mode === 'chat'    && student && <Chat student={student} onScan={() => setMode('scan')} onCheckOut={handleCheckOut} />}
      {mode === 'scan'    && student && <ScanSubmit student={student} onDone={() => setMode('chat')} onCheckOut={handleCheckOut} />}
    </div>
  )
}

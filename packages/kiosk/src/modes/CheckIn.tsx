import type { Student } from '../App'

interface Props {
  onCheckIn: (student: Student) => void
}

// TODO: replace mock with QR badge scan or BHCS portal lookup
const MOCK_STUDENTS: Student[] = [
  { id: 'stu-001', name: 'Alex Chen', nameZh: '陈明' },
  { id: 'stu-002', name: 'Maya Li',   nameZh: '李雅' },
]

export default function CheckIn({ onCheckIn }: Props) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <h1 style={{ fontSize: 36, fontWeight: 700, margin: 0 }}>Welcome to Atrium</h1>
      <p style={{ fontSize: 18, color: '#555', margin: 0 }}>欢迎来到学习中心</p>
      <p style={{ fontSize: 14, color: '#888' }}>Scan your badge or select your name below</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 320 }}>
        {MOCK_STUDENTS.map((s) => (
          <button
            key={s.id}
            onClick={() => onCheckIn(s)}
            style={{ padding: '16px 24px', fontSize: 18, fontFamily: 'DM Sans, sans-serif', fontWeight: 500, borderRadius: 12, border: '2px solid #d0cdc8', background: '#fff', cursor: 'pointer', textAlign: 'left' }}
          >
            {s.name} <span style={{ color: '#888', fontSize: 14 }}>{s.nameZh}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

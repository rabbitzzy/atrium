import { useState } from 'react'
import type { Student } from '../App'

interface Props {
  student: Student
  onScan: () => void
  onCheckOut: () => void
}

interface Message {
  role: 'docent' | 'student'
  text: string
}

// TODO: wire to skill-graph API for nextTask + evaluator for chat
export default function Chat({ student, onScan, onCheckOut }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'docent', text: `Hi ${student.name}! 你好！Ready to continue where we left off?` },
  ])
  const [input, setInput] = useState('')

  function send() {
    if (!input.trim()) return
    setMessages((prev) => [...prev, { role: 'student', text: input }])
    setInput('')
    // TODO: POST /api/skill-graph/chat with student.id + message
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 720, margin: '0 auto', width: '100%', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontWeight: 600, fontSize: 18 }}>{student.name} · {student.nameZh}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onScan} style={btnStyle('#1a1a2e', '#fff')}>Submit worksheet</button>
          <button onClick={onCheckOut} style={btnStyle('#eee', '#333')}>Check out</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'docent' ? 'flex-start' : 'flex-end', background: m.role === 'docent' ? '#f0ede8' : '#1a1a2e', color: m.role === 'docent' ? '#1a1a2e' : '#fff', padding: '12px 16px', borderRadius: 16, maxWidth: '80%', fontSize: 16 }}>
            {m.text}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask the Docent anything… / 问问题…"
          style={{ flex: 1, padding: '12px 16px', fontSize: 16, borderRadius: 12, border: '2px solid #d0cdc8', fontFamily: 'DM Sans, sans-serif', outline: 'none' }}
        />
        <button onClick={send} style={btnStyle('#1a1a2e', '#fff')}>Send</button>
      </div>
    </div>
  )
}

function btnStyle(bg: string, color: string) {
  return { padding: '10px 20px', background: bg, color, border: 'none', borderRadius: 10, fontSize: 14, fontFamily: 'DM Sans, sans-serif', fontWeight: 600, cursor: 'pointer' } as const
}

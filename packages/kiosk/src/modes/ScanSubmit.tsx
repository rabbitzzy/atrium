import { useRef, useState } from 'react'
import type { Student } from '../App'

interface Props {
  student: Student
  onDone: () => void
  onCheckOut: () => void
}

type ScanState = 'idle' | 'capturing' | 'uploading' | 'done' | 'error'

// TODO: wire to evaluator API — POST /api/evaluator/submit
export default function ScanSubmit({ student, onDone, onCheckOut }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<ScanState>('idle')
  const [debriefUrl, setDebriefUrl] = useState<string | null>(null)

  async function handleFile(file: File) {
    setState('uploading')
    const form = new FormData()
    form.append('scan', file)
    form.append('studentId', student.id)
    try {
      const res = await fetch('/api/evaluator/submit', { method: 'POST', body: form })
      if (!res.ok) throw new Error(await res.text())
      const { debriefUrl: url } = await res.json() as { debriefUrl: string }
      setDebriefUrl(url)
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 24 }}>
      <h2 style={{ margin: 0 }}>Submit your worksheet</h2>
      <p style={{ color: '#555', margin: 0 }}>Place your paper under the camera, then tap Capture</p>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      {state === 'idle' && (
        <button onClick={() => fileRef.current?.click()} style={bigBtn}>
          📷 Capture worksheet
        </button>
      )}
      {state === 'uploading' && <p style={{ fontSize: 18 }}>Evaluating… please wait ⏳</p>}
      {state === 'done' && (
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 18, color: '#2a7a2a' }}>Done! Your Debrief is ready.</p>
          {debriefUrl && <a href={debriefUrl} target="_blank" rel="noreferrer" style={{ fontSize: 16 }}>View Debrief →</a>}
          <button onClick={onDone} style={bigBtn}>Continue learning</button>
        </div>
      )}
      {state === 'error' && <p style={{ color: '#c00' }}>Something went wrong — please try again or ask a teacher.</p>}
      <button onClick={onCheckOut} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer' }}>Check out</button>
    </div>
  )
}

const bigBtn = { padding: '16px 32px', fontSize: 18, fontFamily: 'DM Sans, sans-serif', fontWeight: 600, borderRadius: 14, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer' } as const

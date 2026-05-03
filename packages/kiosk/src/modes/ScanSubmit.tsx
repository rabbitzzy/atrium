import { useCallback, useEffect, useRef, useState } from 'react'
import type { Student } from '../App'

interface Props {
  student: Student
  onDone: () => void
  onCheckOut: () => void
}

type ScanState = 'idle' | 'previewing' | 'evaluating' | 'done' | 'error'

interface QuestionResult {
  number: number
  quality: 'mastered' | 'shaky' | 'needs-help' | 'not-yet'
  transcript: string
  misconception: string | null
  suggestion: string | null
}

interface EvaluationResult {
  questions: QuestionResult[]
  overall_quality: string
  summary_en: string
  summary_zh: string
  next_focus: string
}

const TASK_V0_ID = 'task-v0-001'

const QUALITY_COLORS: Record<string, { bg: string; color: string }> = {
  'mastered':   { bg: '#d4f0e0', color: '#1a7a4a' },
  'shaky':      { bg: '#fff3d4', color: '#8a6a00' },
  'needs-help': { bg: '#ffe0d4', color: '#c04010' },
  'not-yet':    { bg: '#f0f0f0', color: '#666' },
}
function qc(q: string) { return QUALITY_COLORS[q] ?? QUALITY_COLORS['not-yet'] }

export default function ScanSubmit({ student, onDone, onCheckOut }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [result, setResult] = useState<EvaluationResult | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setScanState('previewing')
    } catch (err) {
      setErrMsg(`Camera error: ${(err as Error).message}`)
      setScanState('error')
    }
  }

  async function capture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    stopCamera()
    setScanState('evaluating')

    try {
      const blob = await new Promise<Blob>((res) =>
        canvas.toBlob((b) => res(b!), 'image/jpeg', 0.92)
      )
      const form = new FormData()
      form.append('scan', blob, 'scan.jpg')
      form.append('studentId', student.id)
      form.append('taskId', TASK_V0_ID)

      const res = await fetch('/api/evaluator/submit', { method: 'POST', body: form })
      if (!res.ok) throw new Error(`Evaluator error ${res.status}: ${await res.text()}`)
      setResult(await res.json() as EvaluationResult)
      setScanState('done')
    } catch (err) {
      setErrMsg((err as Error).message)
      setScanState('error')
    }
  }

  function retry() { setErrMsg(null); setScanState('idle') }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 760, margin: '0 auto', width: '100%', padding: 24, gap: 20 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>Submit Worksheet 提交作业</div>
          <div style={{ fontSize: 14, color: '#888', marginTop: 2 }}>{student.name} · {student.nameZh}</div>
        </div>
        <button onClick={onCheckOut} style={ghostBtn}>Check out</button>
      </div>

      {/* Always-present camera elements */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ display: scanState === 'previewing' ? 'block' : 'none', width: '100%', borderRadius: 12, background: '#000', maxHeight: 480, objectFit: 'cover' }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Idle */}
      {scanState === 'idle' && (
        <div style={{ textAlign: 'center', paddingTop: 32, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
          <p style={{ fontSize: 16, color: '#555', margin: 0 }}>Hold your completed worksheet up to the camera, then tap Capture.</p>
          <p style={{ fontSize: 14, color: '#999', margin: 0 }}>把完成的作业对着摄像头，然后点击拍照。</p>
          <button onClick={startCamera} style={{ ...bigBtn, maxWidth: 300 }}>📷 Start Camera</button>
        </div>
      )}

      {/* Camera live — capture button shown below video */}
      {scanState === 'previewing' && (
        <button onClick={capture} style={bigBtn}>📸 Capture &amp; Grade</button>
      )}

      {/* Evaluating */}
      {scanState === 'evaluating' && (
        <div style={{ textAlign: 'center', padding: 48, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 34, height: 34, border: '3px solid #e0e0e0', borderTopColor: '#1a1a2e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ fontSize: 16, color: '#555', margin: 0 }}>Grading with AI… 正在评分…</p>
          <p style={{ fontSize: 13, color: '#aaa', margin: 0 }}>Takes about 10–20 seconds</p>
        </div>
      )}

      {/* Error */}
      {scanState === 'error' && (
        <div style={{ padding: 20, background: '#fff0ee', borderRadius: 12, border: '1px solid #ffc8c0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <strong style={{ color: '#c04010' }}>Something went wrong</strong>
          <p style={{ margin: 0, fontSize: 14, color: '#c04010' }}>{errMsg}</p>
          <button onClick={retry} style={{ ...bigBtn, maxWidth: 200 }}>Try Again</button>
        </div>
      )}

      {/* Debrief */}
      {scanState === 'done' && result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Summary card */}
          <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <span style={{ ...qc(result.overall_quality), display: 'inline-block', padding: '3px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
              {result.overall_quality}
            </span>
            <p style={{ fontSize: 16, color: '#222', margin: '0 0 8px' }}>{result.summary_en}</p>
            <p style={{ fontSize: 15, color: '#666', margin: 0 }}>{result.summary_zh}</p>
          </div>

          {/* Per-question rows */}
          {result.questions.map((q) => (
            <div key={q.number} style={{ background: '#fff', borderRadius: 12, padding: '12px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ ...qc(q.quality), padding: '2px 10px', borderRadius: 16, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {q.number}. {q.quality}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#222' }}>Wrote: <em>{q.transcript}</em></div>
                {q.misconception && <div style={{ fontSize: 13, color: '#888', marginTop: 3 }}>{q.misconception}</div>}
                {q.suggestion && <div style={{ fontSize: 13, color: '#1a6bb5', marginTop: 3 }}>{q.suggestion}</div>}
              </div>
            </div>
          ))}

          {/* Next focus */}
          {result.next_focus && (
            <div style={{ background: '#eef6ff', borderRadius: 12, padding: '12px 16px', fontSize: 14, color: '#1a6bb5' }}>
              📚 <strong>Next practice:</strong> {result.next_focus}
            </div>
          )}

          <button onClick={onDone} style={bigBtn}>Continue Learning →</button>
        </div>
      )}
    </div>
  )
}

const bigBtn: React.CSSProperties = { padding: '14px 28px', fontSize: 16, fontFamily: 'DM Sans, sans-serif', fontWeight: 600, borderRadius: 12, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer', width: '100%', alignSelf: 'center' }
const ghostBtn: React.CSSProperties = { padding: '8px 16px', background: 'none', border: '1px solid #d0cdc8', color: '#666', borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans, sans-serif', cursor: 'pointer' }

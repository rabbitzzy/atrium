import { useCallback, useEffect, useRef, useState } from 'react'
import type { Student } from '../App'
import {
  captureFrame,
  listCameras,
  preferredCamera,
  rememberCamera,
  startStream,
  type Camera,
} from '../lib/camera'

interface Props {
  student: Student
  onDone: () => void
  onCheckOut: () => void
}

type Phase = 'setup' | 'live' | 'uploading' | 'done' | 'error'

/**
 * Camera discovery is its own state machine. Collapsing these into "no
 * cameras listed" leaves an operator staring at an empty dropdown and a dead
 * button with nothing to act on — each case has a different fix.
 */
type CameraState = 'probing' | 'ready' | 'denied' | 'none' | 'failed'

const CAMERA_HELP: Record<Exclude<CameraState, 'ready' | 'probing'>, string> = {
  denied:
    'Chrome blocked camera access. Click the camera icon in the address bar, allow access, then retry.',
  none: 'No camera detected. Check that the document camera is plugged in, then retry.',
  failed:
    'Still waiting on camera permission. Look for the permission prompt in the address bar and choose Allow, then retry.',
}

/**
 * getUserMedia neither resolves nor rejects while a permission prompt sits
 * unanswered, so without a deadline the setup screen can hang on "Looking for
 * cameras…" indefinitely — the exact dead end this state machine exists to
 * prevent.
 */
const PROBE_TIMEOUT_MS = 12_000

type Kind = 'worksheet' | 'chess' | 'doodle'

const KINDS: { id: Kind; label: string; labelZh: string; icon: string; blurb: string }[] = [
  { id: 'worksheet', label: 'Worksheet', labelZh: '作业', icon: '📝', blurb: 'Graded against a rubric' },
  { id: 'chess', label: 'Chess notes', labelZh: '棋谱', icon: '♟️', blurb: 'Moves transcribed verbatim' },
  { id: 'doodle', label: 'Doodle', labelZh: '涂鸦', icon: '🎨', blurb: 'Saved, not graded' },
]

interface CaptureResponse {
  captureId: string
  fileUrl: string
  storageBackend: 'drive' | 'local'
  kind: Kind
  ocrStatus: 'ok' | 'failed' | 'skipped'
  ocrError: string | null
  ocrMs: number | null
  ocr: unknown
}

export default function Capture({ student, onDone, onCheckOut }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [phase, setPhase] = useState<Phase>('setup')
  const [cameras, setCameras] = useState<Camera[]>([])
  const [camera, setCamera] = useState<Camera | null>(null)
  const [camState, setCamState] = useState<CameraState>('probing')
  const [kind, setKind] = useState<Kind>('worksheet')
  const [result, setResult] = useState<CaptureResponse | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  // Enumerate on mount so the operator sees real device names immediately.
  // Exposed as a callback so the failure states can offer a retry rather than
  // forcing a page reload.
  const probeCameras = useCallback(async () => {
    setCamState('probing')
    try {
      const found = await Promise.race([
        listCameras(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), PROBE_TIMEOUT_MS),
        ),
      ])
      setCameras(found)
      setCamera(preferredCamera(found))
      setCamState(found.length > 0 ? 'ready' : 'none')
    } catch (err) {
      // NotAllowedError is a blocked permission; NotFoundError is no hardware.
      // They look identical in the UI otherwise, and have different fixes.
      const name = (err as Error).name
      setCamState(name === 'NotAllowedError' ? 'denied' : name === 'NotFoundError' ? 'none' : 'failed')
    }
  }, [])

  useEffect(() => {
    void probeCameras()
  }, [probeCameras])

  async function goLive(target: Camera) {
    try {
      stopCamera()
      const stream = await startStream(target.deviceId)
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      rememberCamera(target)
      setPhase('live')
    } catch (err) {
      setErrMsg(`Could not open ${target.label}: ${(err as Error).message}`)
      setPhase('error')
    }
  }

  async function shoot() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    let frame
    try {
      frame = captureFrame(video, canvas)
    } catch (err) {
      setErrMsg((err as Error).message)
      setPhase('error')
      return
    }

    stopCamera()
    setPhase('uploading')

    try {
      const res = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: frame.base64,
          mimeType: frame.mimeType,
          studentId: student.id,
          studentName: student.name,
          kind,
        }),
      })
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(detail.error ?? `Capture failed (${res.status})`)
      }
      setResult((await res.json()) as CaptureResponse)
      setPhase('done')
    } catch (err) {
      setErrMsg((err as Error).message)
      setPhase('error')
    }
  }

  function again() {
    setResult(null)
    setErrMsg(null)
    setPhase('setup')
  }

  return (
    <div style={page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>Capture 拍摄</div>
          <div style={{ fontSize: 14, color: '#888', marginTop: 2 }}>
            {student.name}
            {student.nameZh ? ` · ${student.nameZh}` : ''}
          </div>
        </div>
        <button onClick={onCheckOut} style={ghostBtn}>Check out</button>
      </header>

      {/* Video element must stay mounted so the ref survives phase changes. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          display: phase === 'live' ? 'block' : 'none',
          width: '100%',
          borderRadius: 12,
          background: '#000',
          maxHeight: 460,
          objectFit: 'contain',
        }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {phase === 'setup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section>
            <label style={sectionLabel}>Camera</label>

            {camState === 'probing' && <p style={{ ...hint, margin: 0 }}>Looking for cameras…</p>}

            {camState === 'ready' && (
              <>
                <select
                  value={camera?.deviceId ?? ''}
                  onChange={(e) => setCamera(cameras.find((c) => c.deviceId === e.target.value) ?? null)}
                  style={select}
                >
                  {cameras.map((c) => (
                    <option key={c.deviceId} value={c.deviceId}>{c.label}</option>
                  ))}
                </select>
                <p style={hint}>Pick the overhead document camera, not the built-in webcam.</p>
              </>
            )}

            {camState !== 'probing' && camState !== 'ready' && (
              <div style={{ padding: 14, background: '#fff8ee', border: '1px solid #f0d9a8', borderRadius: 10 }}>
                <p style={{ margin: 0, fontSize: 14, color: '#8a6a00' }}>{CAMERA_HELP[camState]}</p>
                <button onClick={() => void probeCameras()} style={{ ...ghostBtn, marginTop: 10 }}>
                  Retry
                </button>
              </div>
            )}
          </section>

          <section>
            <label style={sectionLabel}>What are we capturing?</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  onClick={() => setKind(k.id)}
                  style={{
                    ...kindBtn,
                    borderColor: kind === k.id ? '#1a1a2e' : '#d0cdc8',
                    background: kind === k.id ? '#f4f2ef' : '#fff',
                  }}
                >
                  <span style={{ fontSize: 22 }}>{k.icon}</span>
                  <span style={{ flex: 1, textAlign: 'left' }}>
                    <span style={{ fontWeight: 600 }}>{k.label}</span>{' '}
                    <span style={{ color: '#888', fontSize: 14 }}>{k.labelZh}</span>
                    <span style={{ display: 'block', fontSize: 13, color: '#999', marginTop: 2 }}>{k.blurb}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <button
            onClick={() => camera && goLive(camera)}
            disabled={!camera}
            style={{ ...bigBtn, opacity: camera ? 1 : 0.5, cursor: camera ? 'pointer' : 'not-allowed' }}
          >
            {camState === 'ready' ? '📷 Start Camera' : '📷 Camera unavailable'}
          </button>
        </div>
      )}

      {phase === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ ...hint, textAlign: 'center', margin: 0 }}>
            Place the page flat under the camera. Keep all four corners in frame.
          </p>
          <button onClick={shoot} style={bigBtn}>📸 Capture {KINDS.find((k) => k.id === kind)!.label}</button>
          <button onClick={again} style={ghostBtn}>Back</button>
        </div>
      )}

      {phase === 'uploading' && (
        <div style={{ textAlign: 'center', padding: 48, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <div style={spinner} />
          <p style={{ fontSize: 16, color: '#555', margin: 0 }}>Saving and reading… 正在保存…</p>
          <p style={{ fontSize: 13, color: '#aaa', margin: 0 }}>
            {kind === 'doodle' ? 'Just saving this one' : 'Usually 5–20 seconds'}
          </p>
        </div>
      )}

      {phase === 'error' && (
        <div style={errorCard}>
          <strong style={{ color: '#c04010' }}>Something went wrong</strong>
          <p style={{ margin: 0, fontSize: 14, color: '#c04010' }}>{errMsg}</p>
          <button onClick={again} style={{ ...bigBtn, maxWidth: 200 }}>Try Again</button>
        </div>
      )}

      {phase === 'done' && result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ResultCard result={result} />
          <a href={result.fileUrl} target="_blank" rel="noreferrer" style={driveLink}>
            🗂️ Open original{result.storageBackend === 'drive' ? ' in Google Drive' : ''}
          </a>
          <button onClick={again} style={bigBtn}>Capture Another</button>
          <button onClick={onDone} style={ghostBtn}>Done</button>
        </div>
      )}
    </div>
  )
}

// ── Result rendering ─────────────────────────────────────────────────────────

interface WorksheetOcr {
  questions: { number: number; quality: string; transcript: string; misconception: string | null; suggestion: string | null }[]
  overall_quality: string
  summary_en: string
  summary_zh: string
  next_focus: string
}

interface ChessOcr {
  metadata: { white: string | null; black: string | null; date: string | null; result: string | null }
  moves: { n: number; w: string | null; b: string | null }[]
}

const QUALITY_COLORS: Record<string, { bg: string; color: string }> = {
  mastered: { bg: '#d4f0e0', color: '#1a7a4a' },
  shaky: { bg: '#fff3d4', color: '#8a6a00' },
  'needs-help': { bg: '#ffe0d4', color: '#c04010' },
  'not-yet': { bg: '#f0f0f0', color: '#666' },
}
const qc = (q: string) => QUALITY_COLORS[q] ?? QUALITY_COLORS['not-yet']!

function ResultCard({ result }: { result: CaptureResponse }) {
  if (result.ocrStatus === 'skipped') {
    return (
      <div style={card}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🎨</div>
        <strong>Saved</strong>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: '#666' }}>
          Doodles are kept as-is — no grading, no feedback.
        </p>
      </div>
    )
  }

  if (result.ocrStatus === 'failed') {
    // The image is already safe in Drive; say so, because that is the thing
    // the operator actually needs to know before deciding whether to re-shoot.
    return (
      <div style={{ ...card, background: '#fff8ee', border: '1px solid #f0d9a8' }}>
        <strong style={{ color: '#8a6a00' }}>Saved, but couldn&apos;t be read</strong>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: '#8a6a00' }}>{result.ocrError}</p>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#999' }}>
          The image is stored and can be re-processed later.
        </p>
      </div>
    )
  }

  if (result.kind === 'worksheet') {
    const ocr = result.ocr as WorksheetOcr
    return (
      <>
        <div style={card}>
          <span style={{ ...qc(ocr.overall_quality), display: 'inline-block', padding: '3px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
            {ocr.overall_quality}
          </span>
          <p style={{ fontSize: 16, color: '#222', margin: '0 0 8px' }}>{ocr.summary_en}</p>
          <p style={{ fontSize: 15, color: '#666', margin: 0 }}>{ocr.summary_zh}</p>
        </div>
        {ocr.questions.map((q) => (
          <div key={q.number} style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 16px' }}>
            <span style={{ ...qc(q.quality), padding: '2px 10px', borderRadius: 16, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {q.number}. {q.quality}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: '#222' }}>Wrote: <em>{q.transcript}</em></div>
              {q.misconception && <div style={{ fontSize: 13, color: '#888', marginTop: 3 }}>{q.misconception}</div>}
              {q.suggestion && <div style={{ fontSize: 13, color: '#1a6bb5', marginTop: 3 }}>{q.suggestion}</div>}
            </div>
          </div>
        ))}
      </>
    )
  }

  const ocr = result.ocr as ChessOcr
  return (
    <div style={card}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
        {ocr.metadata.white ?? '?'} vs {ocr.metadata.black ?? '?'}
      </div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
        {ocr.moves.length} move pairs transcribed{ocr.metadata.result ? ` · ${ocr.metadata.result}` : ''}
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto', fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.7 }}>
        {ocr.moves.map((m) => (
          <div key={m.n} style={{ display: 'flex', gap: 10 }}>
            <span style={{ color: '#aaa', width: 28, textAlign: 'right' }}>{m.n}.</span>
            <span style={{ width: 76 }}>{m.w ?? '—'}</span>
            <span>{m.b ?? '—'}</span>
          </div>
        ))}
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 12, color: '#999' }}>
        Transcribed verbatim — misspellings are preserved on purpose so the
        chess-karma validator can correct them against board state.
      </p>
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const page: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 760, margin: '0 auto', width: '100%', padding: 24, gap: 20 }
const card: React.CSSProperties = { background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
const errorCard: React.CSSProperties = { padding: 20, background: '#fff0ee', borderRadius: 12, border: '1px solid #ffc8c0', display: 'flex', flexDirection: 'column', gap: 12 }
const bigBtn: React.CSSProperties = { padding: '14px 28px', fontSize: 16, fontFamily: 'DM Sans, sans-serif', fontWeight: 600, borderRadius: 12, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer', width: '100%' }
const ghostBtn: React.CSSProperties = { padding: '8px 16px', background: 'none', border: '1px solid #d0cdc8', color: '#666', borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans, sans-serif', cursor: 'pointer' }
const kindBtn: React.CSSProperties = { display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px', borderRadius: 12, border: '2px solid #d0cdc8', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 16 }
const select: React.CSSProperties = { width: '100%', padding: '12px 14px', fontSize: 15, fontFamily: 'DM Sans, sans-serif', borderRadius: 10, border: '1px solid #d0cdc8', background: '#fff' }
const sectionLabel: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }
const hint: React.CSSProperties = { fontSize: 13, color: '#999', margin: '8px 0 0' }
const spinner: React.CSSProperties = { width: 34, height: 34, border: '3px solid #e0e0e0', borderTopColor: '#1a1a2e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }
const driveLink: React.CSSProperties = { display: 'block', textAlign: 'center', padding: '10px', fontSize: 14, color: '#1a6bb5', textDecoration: 'none', border: '1px solid #cfe0f5', borderRadius: 10, background: '#f5f9ff' }

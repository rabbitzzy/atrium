import { useCallback, useEffect, useRef, useState } from 'react'
import type { Student } from '../App'
import {
  captureFrame,
  listCameras,
  preferredCamera,
  rememberCamera,
  startStream,
  streamMode,
  type Camera,
  type StreamMode,
} from '../lib/camera'
import {
  PAGE_UP_DEFAULT,
  PAPER,
  PAPER_FOR_KIND,
  cropRegion,
  orientationFor,
  quarterTurnsFor,
  type PageUp,
} from '../lib/paper'
import { FOCUS_WARN_BELOW } from '../lib/focus'
import { detectPage, type Detection, type Quad } from '../lib/page-detect'

interface Props {
  student: Student
  onDone: () => void
  onCheckOut: () => void
}

type Phase = 'setup' | 'live' | 'focusing' | 'uploading' | 'done' | 'error'

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

/** Quad as SVG polygon points in a 0–100 viewBox. */
const quadPoints = (q: Quad): string =>
  [q.tl, q.tr, q.br, q.bl].map((p) => `${p.x * 100},${p.y * 100}`).join(' ')

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
  /** Monotonic id of the most recent open request, so stale ones can bow out. */
  const openSeq = useRef(0)
  /** The open currently in flight, so the next one can queue behind it. */
  const openingRef = useRef<Promise<void> | null>(null)

  const [phase, setPhase] = useState<Phase>('setup')
  const [cameras, setCameras] = useState<Camera[]>([])
  const [camera, setCamera] = useState<Camera | null>(null)
  const [camState, setCamState] = useState<CameraState>('probing')
  const [kind, setKind] = useState<Kind>('worksheet')
  const [pageUp, setPageUp] = useState<PageUp>(
    () => (localStorage.getItem('atrium.pageUp') as PageUp | null) ?? PAGE_UP_DEFAULT,
  )
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null)
  const [mode, setMode] = useState<StreamMode | null>(null)
  const [detected, setDetected] = useState<Detection | null>(null)
  const [softFocus, setSoftFocus] = useState<number | null>(null)
  const [result, setResult] = useState<CaptureResponse | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const paper = PAPER_FOR_KIND[kind]!
  // The fallback rectangle, shown only when the page's own edges cannot be
  // found. When they can, the outline below traces the real page instead.
  const guide = frameSize ? cropRegion(paper, orientationFor(pageUp), frameSize.w, frameSize.h) : null

  /*
   * Trace the detected page on the live preview.
   *
   * This is the honest version of the crop guide: rather than drawing a
   * rectangle and hoping the student lines the page up inside it, it draws
   * where the page actually is, so what is outlined is exactly what will be
   * stored. When detection fails the outline disappears and the fixed
   * rectangle comes back, which is also the signal that the capture will fall
   * back to it.
   *
   * 4Hz, because detection costs ~100ms on a full-resolution frame and the
   * page is not moving quickly — a student sliding paper into place is served
   * fine by four updates a second.
   */
  useEffect(() => {
    if (phase !== 'live') return
    let cancelled = false
    const tick = () => {
      const video = videoRef.current
      if (cancelled || !video?.videoWidth) return
      setDetected(detectPage(video, video.videoWidth, video.videoHeight))
    }
    tick()
    const timer = setInterval(tick, 250)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [phase])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  /*
   * Track the frame size for the whole life of the element, not just the first
   * loadedmetadata. Chrome fires that event with an initial size and then
   * revises videoWidth/videoHeight when the real mode negotiates — so a
   * one-shot read left the guide sized for 640x480 while captures cropped a
   * 3840x3104 frame. Different aspect ratios, so the rectangle the student
   * lined the page up against was not the rectangle that got saved. `resize` is
   * the event that fires on every subsequent revision.
   */
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const sync = () => {
      if (video.videoWidth) setFrameSize({ w: video.videoWidth, h: video.videoHeight })
    }
    sync()
    video.addEventListener('resize', sync)
    video.addEventListener('loadedmetadata', sync)
    return () => {
      video.removeEventListener('resize', sync)
      video.removeEventListener('loadedmetadata', sync)
    }
  }, [])

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
      const chosen = preferredCamera(found)
      setCamera(chosen)
      setCamState(found.length > 0 ? 'ready' : 'none')
      // Go live immediately. A student walks up with paper in hand; making
      // them press "start camera" before they can even see whether the page
      // is framed is a tap that buys nothing.
      if (chosen) void goLive(chosen)
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

  /**
   * Open a camera, one at a time, newest request wins.
   *
   * Two overlapping opens of the same device do not both get what they asked
   * for: the first one to reach the driver fixes the format, and the second is
   * handed that format regardless of its constraints. The result was a kiosk
   * silently running at 640x480 while believing it had the full sensor — which
   * is most of what "captures varied between 2000px and 640px wide across
   * sessions" was.
   *
   * StrictMode's double-invoked mount effect makes this happen on every single
   * dev load, but it is not a dev-only problem: switching cameras twice quickly,
   * or a retry landing on top of an in-flight open, races just as well in
   * production.
   *
   * So requests queue behind each other, and any open that has been superseded
   * by a newer one throws its stream away instead of installing it.
   */
  async function goLive(target: Camera) {
    const seq = ++openSeq.current
    const prior = openingRef.current

    const run = (async () => {
      await prior?.catch(() => {})
      if (seq !== openSeq.current) return

      // Already looking at this camera at full resolution — reuse it rather
      // than restarting, which would cost another autofocus sweep.
      const live = streamRef.current?.getVideoTracks()[0]
      if (live?.readyState === 'live' && live.getSettings().deviceId === target.deviceId && streamMode(live).full) {
        setPhase('live')
        return
      }

      stopCamera()
      const stream = await startStream(target.deviceId)
      if (seq !== openSeq.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      rememberCamera(target)

      // A track can end without the page knowing: the camera is unplugged, or
      // another app claims it. Without this the preview silently freezes on a
      // black frame and Capture stores it — a broken capture that looks like a
      // successful one.
      const [videoTrack] = stream.getVideoTracks()
      if (videoTrack) {
        videoTrack.onended = () => {
          setCamState('none')
          setPhase('setup')
        }
        setMode(streamMode(videoTrack))
      }

      setPhase('live')
    })().catch((err: unknown) => {
      if (seq !== openSeq.current) return
      setErrMsg(`Could not open ${target.label}: ${(err as Error).message}`)
      setPhase('error')
    })

    openingRef.current = run
    return run
  }

  async function shoot() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const rect = cropRegion(paper, orientationFor(pageUp), video.videoWidth, video.videoHeight)
    setPhase('focusing')

    let frame
    try {
      // The upright page's aspect, which is what the deskewed output is drawn
      // at — so a page photographed at a slight angle comes out the shape it
      // really is, not the shape the lens saw.
      frame = await captureFrame(
        video,
        canvas,
        rect,
        quarterTurnsFor(pageUp),
        2400,
        PAPER[paper].width / PAPER[paper].height,
      )
    } catch (err) {
      setErrMsg((err as Error).message)
      setPhase('error')
      return
    }
    // Deliberately no stopCamera() here. Tearing the stream down after every
    // shot was half the focus bug: reopening it restarts the camera's autofocus
    // sweep, so every capture after the first was taken during a rack rather
    // than after one. The stream stays live for the whole visit and only stops
    // when this screen unmounts.
    setPhase('uploading')

    // Warn, never block: a blurry capture still gets stored and OCR'd, because
    // a threshold that refuses real work is worse than a soft image.
    setSoftFocus(frame.focus.chosen < FOCUS_WARN_BELOW ? frame.focus.chosen : null)

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
          crop: {
            paper,
            orientation: orientationFor(pageUp),
            pageUp,
            rect,
            focus: frame.focus,
            detect: frame.crop,
            mode,
            source: { width: frame.sourceWidth, height: frame.sourceHeight },
            output: { width: frame.width, height: frame.height },
          },
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

  // Back to the live view, not to setup: the stream is still running, and
  // restarting it would hand the next capture the same cold autofocus sweep
  // this screen exists to avoid. Only re-probe if the camera really is gone.
  function again() {
    setSoftFocus(null)
    setResult(null)
    setErrMsg(null)
    if (streamRef.current?.getVideoTracks()[0]?.readyState === 'live') {
      setPhase('live')
    } else {
      // The camera really is gone — show the setup screen while re-probing,
      // rather than leaving the previous result on screen with nothing happening.
      setPhase('setup')
      void probeCameras()
    }
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

      {/*
        Video element must stay mounted so the ref survives phase changes.
        No object-fit here on purpose: letterboxing would offset the guide from
        the actual frame, and a crop guide that lies about what gets captured
        is worse than none. Letting the element take the video's own aspect
        keeps overlay percentages exact.
      */}
      <div style={{ position: 'relative', display: phase === 'live' || phase === 'focusing' ? 'block' : 'none' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={(e) =>
            setFrameSize({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })
          }
          style={{ display: 'block', width: '100%', borderRadius: 12, background: '#000' }}
        />
        {/* Page found: trace its actual corners, and dim everything outside
            them, so the lit region is literally the image that gets stored. */}
        {detected?.quad && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            <defs>
              <mask id="pagemask">
                <rect x="0" y="0" width="100" height="100" fill="white" />
                <polygon points={quadPoints(detected.quad)} fill="black" />
              </mask>
            </defs>
            <rect x="0" y="0" width="100" height="100" fill="rgba(0,0,0,0.42)" mask="url(#pagemask)" />
            <polygon
              points={quadPoints(detected.quad)}
              fill="none"
              stroke="rgba(90,220,140,0.95)"
              strokeWidth="0.4"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}

        {/* No page found — fall back to the fixed rectangle, which is also what
            the capture itself will fall back to. */}
        {!detected?.quad && guide && (
          <div
            style={{
              position: 'absolute',
              left: `${guide.x * 100}%`,
              top: `${guide.y * 100}%`,
              width: `${guide.width * 100}%`,
              height: `${guide.height * 100}%`,
              border: '2px dashed rgba(255,255,255,0.75)',
              borderRadius: 4,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/*
        Setup only renders while the camera is unavailable. Once a device is
        found the stream starts on its own and this collapses into the live
        view, so the student never presses a button just to see the lens.
      */}
      {phase === 'setup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {camState === 'probing' && <p style={{ ...hint, margin: 0 }}>Looking for cameras…</p>}

          {/* 'ready' is momentarily reachable here, between the probe
              resolving and goLive() flipping the phase. */}
          {camState !== 'probing' && camState !== 'ready' && (
            <div style={{ padding: 14, background: '#fff8ee', border: '1px solid #f0d9a8', borderRadius: 10 }}>
              <p style={{ margin: 0, fontSize: 14, color: '#8a6a00' }}>{CAMERA_HELP[camState]}</p>
              <button onClick={() => void probeCameras()} style={{ ...ghostBtn, marginTop: 10 }}>
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {phase === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ ...hint, margin: 0 }}>
              Line the page up inside the frame — {PAPER[paper].label}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#999' }}>page top</span>
              {([['top','↑'],['right','→'],['bottom','↓'],['left','←']] as const).map(([o, glyph]) => (
                <button
                  key={o}
                  onClick={() => { setPageUp(o); localStorage.setItem('atrium.pageUp', o) }}
                  title={`Top of the page points ${o}`}
                  style={{
                    ...ghostBtn,
                    padding: '4px 9px',
                    fontSize: 14,
                    borderColor: pageUp === o ? '#1a1a2e' : '#d0cdc8',
                    color: pageUp === o ? '#1a1a2e' : '#aaa',
                  }}
                >
                  {glyph}
                </button>
              ))}
            </div>
            {frameSize && (
              <span style={{ fontSize: 12, color: mode && !mode.full ? '#c04010' : '#bbb' }}>
                sensor {frameSize.w}×{frameSize.h}
              </span>
            )}
          </div>

          {/*
            The camera can come up in a reduced mode and say nothing about it —
            capabilities still advertise the full sensor, and the picture still
            looks fine on a scaled-down preview. The only place it shows is in
            an unreadable capture an hour later, so it has to be said out loud
            here, while someone is standing in front of the station.
          */}
          {mode && !mode.full && (
            <div style={{ padding: 12, background: '#fff0ee', border: '1px solid #ffc8c0', borderRadius: 10 }}>
              <strong style={{ color: '#c04010', fontSize: 14 }}>Camera is running at reduced resolution</strong>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#c04010' }}>
                {mode.width}×{mode.height} instead of {mode.maxWidth}×{mode.maxHeight}. Captures will
                be too coarse to read reliably. Unplug the camera, plug it back in, then press Retry.
              </p>
              <button onClick={() => void probeCameras()} style={{ ...ghostBtn, marginTop: 10 }}>Retry</button>
            </div>
          )}

          {/* Choosing the kind while the page is already framed collapses two
              screens into one — aim and decide are the same moment. */}
          <div style={{ display: 'flex', gap: 10 }}>
            {KINDS.map((k) => (
              <button
                key={k.id}
                onClick={() => setKind(k.id)}
                style={{
                  ...kindBtn,
                  flex: 1,
                  flexDirection: 'column',
                  gap: 2,
                  padding: '10px 8px',
                  borderColor: kind === k.id ? '#1a1a2e' : '#d0cdc8',
                  background: kind === k.id ? '#f4f2ef' : '#fff',
                }}
              >
                <span style={{ fontSize: 20 }}>{k.icon}</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{k.label}</span>
                <span style={{ color: '#999', fontSize: 12 }}>{k.blurb}</span>
              </button>
            ))}
          </div>

          <button onClick={shoot} style={bigBtn}>📸 Capture {KINDS.find((k) => k.id === kind)!.label}</button>

          {cameras.length > 1 && (
            <select
              value={camera?.deviceId ?? ''}
              onChange={(e) => {
                const next = cameras.find((c) => c.deviceId === e.target.value)
                if (next) {
                  setCamera(next)
                  void goLive(next)
                }
              }}
              style={{ ...select, fontSize: 13, padding: '8px 12px' }}
            >
              {cameras.map((c) => (
                <option key={c.deviceId} value={c.deviceId}>{c.label}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/*
        The camera takes seconds to settle and looks deceptively sharp part-way
        through, so the wait has to be visible — otherwise a student reads the
        frozen-looking screen as "it broke" and lifts the page mid-burst.
      */}
      {phase === 'focusing' && (
        <div style={{ textAlign: 'center', padding: 24, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <div style={spinner} />
          <p style={{ fontSize: 16, color: '#555', margin: 0 }}>Focusing — hold still 对准中…</p>
          <p style={{ fontSize: 13, color: '#aaa', margin: 0 }}>Keep your hands out of the frame</p>
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
          {softFocus !== null && (
            <div style={{ padding: 14, background: '#fff8ee', border: '1px solid #f0d9a8', borderRadius: 10 }}>
              <strong style={{ color: '#8a6a00', fontSize: 14 }}>This looks out of focus</strong>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#8a6a00' }}>
                Saved anyway, but the reading may be unreliable. Let the camera
                settle for a moment, then capture again.
              </p>
            </div>
          )}
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

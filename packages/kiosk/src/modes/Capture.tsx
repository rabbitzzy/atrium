import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CaptureResponse, Student } from '@atrium/schema'
import {
  captureFrame,
  listCameras,
  lastAspect,
  preferredCamera,
  rememberAspect,
  rememberCamera,
  startStream,
  streamMode,
  type Camera,
  type StreamMode,
} from '../lib/camera'
import {
  PAPER,
  cropRegion,
  defaultPageUp,
  orientationFor,
  quarterTurnsFor,
} from '../lib/paper'
import { FOCUS_WARN_BELOW } from '../lib/focus'
import { detectPage, type Detection, type Quad } from '../lib/page-detect'
import { isEventStream, readCaptureStream } from '../lib/capture-stream'
import { APPS, type AnyCaptureApp } from '../platform/registry'
import WaitChat from '../platform/WaitChat'
import CameraStage from '../platform/CameraStage'
import { SpokenDebrief } from '../platform/ReadAloud'
import { SavingAs, WhoChip } from '../platform/StillHere'
import MyWork from './MyWork'
import { readCardIdentity } from '../lib/card-scan'
import LeafCount from '../platform/LeafCount'
import FloorPlan from './FloorPlan'

interface Props {
  student: Student
  /** The person in front of the station is not this one. Back to check-in. */
  onSwitchStudent: () => void
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

/** Quad as SVG polygon points in a 0–100 viewBox. */
const quadPoints = (q: Quad): string =>
  [q.tl, q.tr, q.br, q.bl].map((p) => `${p.x * 100},${p.y * 100}`).join(' ')

export default function Capture({ student, onSwitchStudent }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  /** Monotonic id of the most recent open request, so stale ones can bow out. */
  const openSeq = useRef(0)
  /** The open currently in flight, so the next one can queue behind it. */
  const openingRef = useRef<Promise<void> | null>(null)

  const [phase, setPhase] = useState<Phase>('setup')
  const [camState, setCamState] = useState<CameraState>('probing')
  /*
   * The whole app, not its id: everything downstream — the crop guide, the
   * result view — is a field on it, so there is nothing left for the platform
   * to look up or branch on.
   *
   * It is no longer chosen in its own step. The three buttons in the live view
   * *are* the shutter, and this holds whichever one was last pressed (or
   * pointed at) so the crop guide and the result screen agree with it.
   */
  const [app, setApp] = useState<AnyCaptureApp>(APPS[0])
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null)
  const [mode, setMode] = useState<StreamMode | null>(null)
  const [detected, setDetected] = useState<Detection | null>(null)
  const [softFocus, setSoftFocus] = useState<number | null>(null)
  const [result, setResult] = useState<CaptureResponse | null>(null)
  /**
   * The frame that was just sent, as a data URL.
   *
   * It costs nothing — the pixels are already in this tab, and it is the one
   * thing on these screens that needs no network at all — so it goes up the
   * instant the shutter fires and stays up through the result. A student who
   * can see their own page knows the machine has it, which is most of what
   * they were waiting to find out.
   */
  const [shot, setShot] = useState<string | null>(null)
  /**
   * The reading so far, for an app that streams. Held as `unknown` like every
   * other payload the platform carries: it is the app's shape, and only the
   * app's own StreamView is allowed to look inside it.
   */
  const [partial, setPartial] = useState<unknown>(null)
  /** Capture id whose resolution step is finished, so it is not offered twice. */
  const [resolvedFor, setResolvedFor] = useState<string | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  /*
   * Whether the student is looking through their own folder instead of at the
   * camera.
   *
   * Held here, inside Capture, rather than as a mode of its own in App: a mode
   * switch would unmount this screen, and unmounting it stops the stream —
   * which means the next capture after every visit to My Work is taken during
   * a cold autofocus sweep. The video element stays mounted and merely hidden,
   * so coming back is instant and sharp.
   */
  const [browsing, setBrowsing] = useState(false)
  /*
   * Same reason My work lives in here rather than in App: opening either must
   * not unmount the camera. They sit over the live view, and it survives.
   */
  const [showingProgress, setShowingProgress] = useState(false)
  /* Bumped when this Visit does something that changes the balance, so the
     count updates now rather than at the next poll. */
  const [leafRefresh, setLeafRefresh] = useState(0)
  /**
   * Whether the stream has painted a frame — not whether it has been opened.
   *
   * The gap between the two is the whole reason the placeholder exists, and it
   * is why this is separate from `phase`: `phase` goes 'live' when the tracks
   * are running, which is a second or more before there is anything on the
   * glass.
   */
  const [videoLive, setVideoLive] = useState(false)

  const paper = app.paper
  /*
   * Whether this app wants a word with the student before showing the result.
   * The platform asks the app and takes the answer — it cannot look inside
   * `result.ocr` to decide, because it does not know what is in there.
   */
  const needsResolve =
    result !== null &&
    result.captureId !== resolvedFor &&
    result.ocrStatus === 'ok' &&
    Boolean(app.Resolve) &&
    (app.needsResolve?.(result.ocr) ?? true)
  /*
   * What this app has to say to this student during the wait, held steady per
   * app rather than rebuilt per render — `waitChat` returns a fresh array
   * every call, and a new array identity on every render would reshuffle the
   * conversation under a child part-way through reading it.
   */
  const waitLines = useMemo(() => app.waitChat?.({ student }) ?? [], [app, student])
  /*
   * Which way up the page is, inferred from the frame's own shape and no
   * longer overridable — the four arrows that used to offer that were a
   * bring-up control, and a wrong answer from a student was worse than the
   * inference. A landscape frame means a page laid sideways, which is also
   * how it should be laid: it fills ~84% of the frame that way against ~55%
   * upright.
   */
  const pageUp = defaultPageUp(frameSize?.w, frameSize?.h)
  /*
   * The camera's box is on screen from the first moment there is any prospect
   * of a camera — including while the devices are still being enumerated. That
   * is the point: the box has to exist before the stream does, or the page is
   * laid out twice. It comes down only for a camera that will not be arriving,
   * where a placeholder promising one would be a lie, and for the screens after
   * the shutter.
   */
  const showStage =
    !browsing &&
    (phase === 'live' ||
      phase === 'focusing' ||
      (phase === 'setup' && (camState === 'probing' || camState === 'ready')))
  const stageNote =
    camState === 'probing' ? 'Waking up the camera… 相机准备中…' : 'Almost ready… 马上就好…'
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
    // There is no picture any more, so the placeholder is the truth again —
    // without this the box keeps showing the last painted frame of a stream
    // that has been torn down.
    setVideoLive(false)
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
      // Whichever camera `preferredCamera` picks is the one used. The station
      // has one document camera pointed at one desk; offering a dropdown made
      // "which lens am I?" a question for a nine-year-old, and the only wrong
      // answer — the laptop's own webcam, aimed at their face — was one tap away.
      const chosen = preferredCamera(found)
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
          setVideoLive(false)
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

  /**
   * Take the picture, as the app that was pressed.
   *
   * `target` is passed rather than read from state because pressing the button
   * is both the choice and the shutter: `setApp` has not landed yet when this
   * runs, and a capture sent under the previous app's id is a worksheet graded
   * as a chess sheet.
   */
  async function shoot(target: AnyCaptureApp) {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    setApp(target)
    const targetPaper = target.paper
    const rect = cropRegion(targetPaper, orientationFor(pageUp), video.videoWidth, video.videoHeight)
    setPartial(null)
    setShot(null)
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
        PAPER[targetPaper].width / PAPER[targetPaper].height,
      )
    } catch (err) {
      setErrMsg((err as Error).message)
      setPhase('error')
      return
    }
    // On screen before the upload has even started: this is the deskewed,
    // cropped frame itself, so it is also an honest preview of exactly what
    // was sent — not a thumbnail of what we hope was sent.
    setShot(`data:${frame.mimeType};base64,${frame.base64}`)

    /*
     * Read the Card code off the page we just cropped, before it is uploaded
     * (BHCS-37, BHCS-31). The canvas is right here and already holds the
     * upright, cropped page — decoding server-side would mean shipping an
     * image decoder to do work the browser has already done.
     *
     * Never blocks. Most pages under this camera are not Cards, and a page
     * without a code is stored and graded exactly as before; all a task id
     * adds is that the grade can move the child's Floor plan afterwards.
     */
    const card = readCardIdentity(canvas)

    // Deliberately no stopCamera() here. Tearing the stream down after every
    // shot was half the focus bug: reopening it restarts the camera's autofocus
    // sweep, so every capture after the first was taken during a rack rather
    // than after one. The stream stays live for the whole visit and only stops
    // when this screen unmounts.
    setPhase('uploading')
    // A submitted Card earns a Leaf (BHCS-39), and the child should watch the
    // number go up rather than find out about it two screens later.
    setTimeout(() => setLeafRefresh((n) => n + 1), 1200)

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
          // Null for most of the roster, and always null for the type-a-name
          // path, which is the honest answer there rather than a gap: nobody
          // checked who this is, so nothing should be assumed about them.
          studentGrade: student.grade ?? null,
          kind: target.id,
          // Present only when this page carried a readable Card code.
          ...(card.found ? { taskId: card.identity.taskId } : {}),
          crop: {
            paper: targetPaper,
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
      // Which of the two the endpoint chose is the app's declaration, made
      // server-side; the kiosk reads it off the response rather than deciding.
      // Both paths end at the same CaptureResponse.
      setResult(
        isEventStream(res)
          ? await readCaptureStream(res, setPartial)
          : ((await res.json()) as CaptureResponse),
      )
      setPhase('done')
    } catch (err) {
      setErrMsg((err as Error).message)
      setPhase('error')
    }
  }

  /*
   * A resolution step has finished. Show the settled result, and persist it —
   * but never block on the write: the student is standing there, they have
   * already answered, and a slow database is not their problem. A failed save
   * leaves the row's machine-made reading in place, which is the same state
   * the capture would have been in had they never been asked.
   */
  function handleResolved(resolved: unknown) {
    setResult((prev) => (prev ? { ...prev, ocr: resolved } : prev))
    setResolvedFor(result?.captureId ?? null)

    if (!result) return
    void fetch('/api/capture-resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ captureId: result.captureId, kind: result.kind, refined: resolved }),
    }).catch(() => {
      // Deliberately silent. Reported nowhere the student can see, because
      // there is nothing they could do about it.
    })
  }

  // Back to the live view, not to setup: the stream is still running, and
  // restarting it would hand the next capture the same cold autofocus sweep
  // this screen exists to avoid. Only re-probe if the camera really is gone.
  function again() {
    setSoftFocus(null)
    setResult(null)
    setPartial(null)
    setShot(null)
    setResolvedFor(null)
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

  /*
   * The page you just took, beside what is being made of it. Both screens
   * after the shutter use it, which is also why the page gets wider here —
   * a Debrief squeezed into half of 760px reads worse than no split at all.
   */
  const split = phase === 'uploading' || (phase === 'done' && result !== null)

  return (
    <div style={{ ...page, maxWidth: split || browsing ? 1080 : 760 }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        /*
          One column on a laptop or a portrait panel, two once there is room
          for both to be readable. The image is sticky rather than scrolling
          away, so a long Debrief is still read against the page it is about.
        */
        .capture-split { display: grid; gap: 20px; grid-template-columns: minmax(0, 1fr); }
        .capture-shot { position: sticky; top: 24px; align-self: start; }
        @media (min-width: 880px) {
          .capture-split { grid-template-columns: 320px minmax(0, 1fr); }
        }
        /*
          The buttons answer back. A control a child taps and cannot tell they
          tapped gets tapped again, which at this station means a second
          capture of a page that was already sent.
        */
        .kind-btn { transition: transform 120ms ease, box-shadow 120ms ease; box-shadow: 0 2px 0 rgba(0,0,0,0.06); }
        .kind-btn:hover { transform: translateY(-3px); box-shadow: 0 8px 18px rgba(0,0,0,0.10); }
        .kind-btn:active { transform: translateY(1px); box-shadow: none; }
      `}</style>

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>Capture 拍摄</div>
        {/*
          Two ways out of the camera, in the order they are wanted: their own
          work, then the end of the visit. Present on every phase of every
          capture, because "where is my dragon drawing?" is not a question that
          waits for a convenient screen — and a folder reachable only from the
          result page would be invisible to the child who has not captured
          anything yet.

          The second of those is the name itself now (BHCS-18). It used to be a
          grey line of text beside a grey "Check out", both of them addressed to
          the student who is leaving — who has already left. The chip says the
          same thing to the student who has just arrived, at a size they can
          read, and one tap gets them their own session.
        */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!browsing && !showingProgress && (
            <>
              <button onClick={() => setBrowsing(true)} style={workBtn}>🗂️ My work 我的作品</button>
              {/*
                A peer of My work, not a step inside it. The two answer
                different questions — "where did my dragon drawing go" and
                "what am I good at" — and burying either one behind the other
                costs the child a level of depth, which is where they get lost.
              */}
              <button onClick={() => setShowingProgress(true)} style={workBtn}>🌱 What I know 我会的</button>
            </>
          )}
          {/* Same slot as the name chip (BHCS-18): the two facts a child needs
              about themselves during a Visit, in one place on every screen. */}
          <LeafCount student={student} refreshKey={leafRefresh} />
          <WhoChip student={student} onSwitch={onSwitchStudent} />
        </div>
      </header>

      {browsing && <MyWork student={student} onBack={() => setBrowsing(false)} />}
      {showingProgress && <FloorPlan student={student} onBack={() => setShowingProgress(false)} />}

      {/*
        Video element must stay mounted so the ref survives phase changes.
        No object-fit here on purpose: letterboxing would offset the guide from
        the actual frame, and a crop guide that lies about what gets captured
        is worse than none. Letting the element take the video's own aspect
        keeps overlay percentages exact.
      */}
      <div
        style={{
          position: 'relative',
          display: showStage ? 'block' : 'none',
          // The hole the camera lands in, sized before there is a camera. Set
          // from the live stream once it exists, from what this station saw
          // last time until then — so it does not change when the two agree,
          // which after the first ever visit is every visit.
          aspectRatio: String(frameSize ? frameSize.w / frameSize.h : lastAspect()),
          borderRadius: 12,
          overflow: 'hidden',
          background: '#0f221c',
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={(e) => {
            setFrameSize({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })
            rememberAspect(e.currentTarget.videoWidth, e.currentTarget.videoHeight)
          }}
          // Fires on the first frame actually painted, which is the moment
          // there is something to look at — `loadedmetadata` is a size, not a
          // picture, and crossfading on it swaps the placeholder for black.
          onPlaying={() => setVideoLive(true)}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'block',
            width: '100%',
            height: '100%',
            opacity: videoLive ? 1 : 0,
            transition: 'opacity 320ms ease',
          }}
        />

        {/* Over the video, under the overlays: it covers the black frame while
            the stream warms up and dissolves once there is a picture. */}
        {!videoLive && <CameraStage note={stageNote} />}
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
      {!browsing && phase === 'setup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Nothing for the probing case: the stage above is already saying
              it, in both languages, in the box the camera is about to fill. */}
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

      {!browsing && phase === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/*
            The only thing left above the buttons is the sensor size, and it is
            not for the student — it is the one number that says whether this
            station is capturing at full resolution, readable over a shoulder
            without touching anything. The instruction line and the page-top
            arrows that used to sit here were for us during bring-up: the green
            outline already tells a child where to put the paper, and no student
            was ever going to answer "which way does the top of the page point?"
          */}
          {frameSize && (
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: 12, color: mode && !mode.full ? '#c04010' : '#ccc' }}>
                sensor {frameSize.w}×{frameSize.h}
              </span>
            </div>
          )}

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

          {/*
            These are the shutter. Choosing the kind and taking the picture
            were two taps for one decision — by the time a student can say
            "this is my worksheet" they have already aimed the page, and a
            second black button underneath only asked them to confirm what
            they had just said.

            Hovering pre-selects, which is what keeps the fallback crop guide
            honest on a machine with a mouse: chess sheets are half-letter and
            the others are letter, so the rectangle changes with the choice. On
            a touch panel there is no hover and the first touch is the shutter —
            fine, because the guide only governs captures where the page's own
            edges could not be found.
          */}
          {/*
            The one line of text allowed back above these buttons (BHCS-18).
            Everything else here was cleared away because it was written for us
            rather than for the student; this is written for the student, and
            it is the only sentence on the screen whose absence has a cost
            measurable in wrongly-attributed work. Pressing one of the buttons
            below is the moment a capture gets a name attached to it, so this is
            where the name belongs — quiet, small, and tappable, so the child
            who reads it and finds someone else's name has the fix under their
            finger already.
          */}
          <SavingAs student={student} onSwitch={onSwitchStudent} />

          <div style={{ display: 'flex', gap: 12 }}>
            {APPS.map((a) => {
              const theme = a.theme ?? NEUTRAL_THEME
              return (
                <button
                  key={a.id}
                  onClick={() => void shoot(a)}
                  onMouseEnter={() => setApp(a)}
                  onFocus={() => setApp(a)}
                  className="kind-btn"
                  style={{
                    ...kindBtn,
                    background: theme.tint,
                    borderColor: theme.accent,
                  }}
                >
                  {/* Big enough to be the button rather than decoration on it:
                      the emoji is the only part a child who cannot yet read
                      "Worksheet" can aim at, so it gets the space. */}
                  <span style={{ fontSize: 44, lineHeight: 1 }}>{a.icon}</span>
                  <span style={{ fontWeight: 700, fontSize: 18, color: '#1a1a2e' }}>{a.label}</span>
                  <span style={{ fontSize: 15, color: theme.accent, fontWeight: 600 }}>{a.labelZh}</span>
                </button>
              )
            })}
          </div>

          {/*
            `blurb` is gone from the button on purpose. "Graded against a
            rubric" is a sentence for the adult choosing to deploy this, not
            for the seven-year-old holding the paper, and it was the longest
            text on the most important control.
          */}
        </div>
      )}

      {/*
        The camera takes seconds to settle and looks deceptively sharp part-way
        through, so the wait has to be visible — otherwise a student reads the
        frozen-looking screen as "it broke" and lifts the page mid-burst.
      */}
      {!browsing && phase === 'focusing' && (
        <div style={{ textAlign: 'center', padding: 24, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <div style={spinner} />
          <p style={{ fontSize: 16, color: '#555', margin: 0 }}>Focusing — hold still 对准中…</p>
          <p style={{ fontSize: 13, color: '#aaa', margin: 0 }}>Keep your hands out of the frame</p>
        </div>
      )}

      {/*
        A spinner until there is something to read, and then the reading
        itself. The swap is the whole feature: the wait is not shortened, it is
        spent on the first question while the fourth is still arriving.

        Nothing here knows what is in `partial` — the app renders it, exactly
        as it renders the finished result.
      */}
      {!browsing && phase === 'uploading' && (
        <div className="capture-split">
          <CapturedShot src={shot} />
          {partial && app.StreamView ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <app.StreamView partial={partial} />
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ ...spinner, width: 18, height: 18, borderWidth: 2 }} />
                <span style={{ fontSize: 13, color: '#aaa' }}>Still reading… 还在看…</span>
              </div>
            </div>
          ) : waitLines.length > 0 ? (
            /*
              The app is talking to the student while its reading arrives. It
              replaces the caption entirely rather than sitting under it: two
              things describing the same wait is one of them being ignored, and
              "Saving and reading…" was always the one that stopped being read
              first, because it never changed.
            */
            <div style={{ padding: '24px 8px' }}>
              <WaitChat lines={waitLines} />
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 48, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              <div style={spinner} />
              <p style={{ fontSize: 16, color: '#555', margin: 0 }}>Saving and reading… 正在保存…</p>
              <p style={{ fontSize: 13, color: '#aaa', margin: 0 }}>{app.waitHint}</p>
            </div>
          )}
        </div>
      )}

      {!browsing && phase === 'error' && (
        <div style={errorCard}>
          <strong style={{ color: '#c04010' }}>Something went wrong</strong>
          <p style={{ margin: 0, fontSize: 14, color: '#c04010' }}>{errMsg}</p>
          <button onClick={again} style={{ ...bigBtn, maxWidth: 200 }}>Try Again</button>
        </div>
      )}

      {/*
        A capture the app wants to ask about takes over the screen before the
        result does. Nothing here knows what is being asked or why — only that
        this app has a step, that this result needs it, and that resolving
        produces a new result to show and to store.
      */}
      {!browsing && phase === 'done' && result && needsResolve && app.Resolve && (
        <div className="capture-split">
          {/* The page belongs on this screen more than on any other: the
              question being asked is about the student's own handwriting, and
              asking someone to recognise what they wrote while their writing
              is off screen is asking them to work from memory. */}
          <CapturedShot src={shot} />
          <app.Resolve result={result.ocr} onResolved={handleResolved} />
        </div>
      )}

      {!browsing && phase === 'done' && result && !needsResolve && (
        <div className="capture-split">
          {/* Everything about the image, next to the image: the focus warning
              is a statement about this picture, and it is far easier to agree
              with while looking at it. */}
          <CapturedShot src={shot} softFocus={softFocus} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/*
              Above the Debrief, not below it. A worksheet with ten questions
              on it produces a result taller than the screen, and the way out
              was at the bottom of it — so the student who most needed to go
              again (the one with the longest page) was the one who had to
              scroll furthest to find out they could. It costs the result the
              top 60px and saves every student the search.
            */}
            {/*
              One button, not two. Checking out already lives in the header of
              every screen here, and a second copy of it beside the big one
              gave a child two ways to end their visit and one to keep going —
              on the screen where keeping going is the whole point.
            */}
            <button onClick={again} style={bigBtn}>
              📸 Show me another! 再来一张
            </button>
            {/*
              At the top of the Debrief, not the bottom of it. The student this
              is for cannot read a word of what follows, so a control placed
              after the thing it reads is a control they never reach — and on a
              ten-question page it is two screens down.
            */}
            {result.ocrStatus === 'ok' && result.ocr != null && (
              <SpokenDebrief app={app} ocr={result.ocr} student={student} />
            )}
            <ResultCard app={app} result={result} student={student} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── The page itself ──────────────────────────────────────────────────────────

/**
 * The captured frame, shown from the moment it exists.
 *
 * Nothing here waits on anything: the pixels are local, so this column is
 * filled while the upload is still in flight. `result` only adds the link to
 * the stored original, which is the one part that needs the round trip.
 */
function CapturedShot({
  src,
  softFocus = null,
}: {
  src: string | null
  softFocus?: number | null
}) {
  if (!src) return <div />

  return (
    <div className="capture-shot" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <img
        src={src}
        alt="The page you just captured"
        style={{ display: 'block', width: '100%', borderRadius: 12, border: '1px solid #e6e3de', background: '#fff' }}
      />
      {softFocus !== null && (
        <div style={{ padding: 14, background: '#fff8ee', border: '1px solid #f0d9a8', borderRadius: 10 }}>
          <strong style={{ color: '#8a6a00', fontSize: 14 }}>This looks out of focus</strong>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#8a6a00' }}>
            Saved anyway, but the reading may be unreliable. Let the camera
            settle for a moment, then capture again.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Result rendering ─────────────────────────────────────────────────────────

/**
 * The platform renders exactly one result state: the one that is true of every
 * app. Extraction failed, the image is safe, here is why — that is a statement
 * about the pipeline, not about what was on the paper.
 *
 * Everything else is the app's own view. A capture that was never extracted
 * ('skipped') is not an error and goes there too: the app that declined to
 * extract is the one that knows what to say about it.
 */
function ResultCard({
  app,
  result,
  student,
}: {
  app: AnyCaptureApp
  result: CaptureResponse
  student: Student
}) {
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

  return <app.ResultView result={result.ocr} student={student} />
}

// ── Styles ───────────────────────────────────────────────────────────────────

const page: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 760, margin: '0 auto', width: '100%', padding: 24, gap: 20 }
const card: React.CSSProperties = { background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
const errorCard: React.CSSProperties = { padding: 20, background: '#fff0ee', borderRadius: 12, border: '1px solid #ffc8c0', display: 'flex', flexDirection: 'column', gap: 12 }
const bigBtn: React.CSSProperties = { padding: '14px 28px', fontSize: 16, fontFamily: 'DM Sans, sans-serif', fontWeight: 600, borderRadius: 12, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer', width: '100%' }
const workBtn: React.CSSProperties = { padding: '8px 16px', background: '#f0ede8', border: '1px solid #d0cdc8', color: '#1a1a2e', borderRadius: 8, fontSize: 14, fontWeight: 600, fontFamily: 'DM Sans, sans-serif', cursor: 'pointer' }
const ghostBtn: React.CSSProperties = { padding: '8px 16px', background: 'none', border: '1px solid #d0cdc8', color: '#666', borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans, sans-serif', cursor: 'pointer' }
const kindBtn: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '20px 8px', borderRadius: 22, border: '3px solid', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }

/** For an app that declares no theme of its own. */
const NEUTRAL_THEME = { tint: '#f4f2ef', accent: '#1a1a2e' }
const spinner: React.CSSProperties = { width: 34, height: 34, border: '3px solid #e0e0e0', borderTopColor: '#1a1a2e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }

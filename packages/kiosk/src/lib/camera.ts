/**
 * Camera selection and frame capture.
 *
 * The kiosk station has at least two cameras: the host machine's built-in
 * webcam and the overhead document camera. getUserMedia() with no deviceId
 * picks the built-in one, which points at the student's face rather than the
 * paper — so device selection is required, not a nicety.
 */

import { focusScore, waitForStableFocus, type FocusGate, type Region } from './focus'

const REMEMBERED_KEY = 'atrium.camera.label'

export interface Camera {
  deviceId: string
  label: string
}

/**
 * Device labels are empty until the page holds a camera permission, so this
 * requests a throwaway stream first and stops it immediately. Without that
 * step the picker shows "Camera 1 / Camera 2" and nobody can tell which is
 * the document camera.
 */
export async function listCameras(): Promise<Camera[]> {
  const probe = await navigator.mediaDevices.getUserMedia({ video: true })
  probe.getTracks().forEach((t) => t.stop())

  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }))
}

/**
 * Pick the camera to use on load.
 *
 * Matches on label rather than deviceId: macOS rotates deviceId when a USB
 * camera is replugged, but the label ("OKIOCAM S2 Pro") is stable. Falls back
 * to anything that looks like a document camera, then to the first device.
 */
export function preferredCamera(cameras: Camera[]): Camera | null {
  if (cameras.length === 0) return null

  const remembered = localStorage.getItem(REMEMBERED_KEY)
  if (remembered) {
    const match = cameras.find((c) => c.label === remembered)
    if (match) return match
  }

  const docCam = cameras.find((c) => /okiocam|ipevo|elmo|document/i.test(c.label))
  return docCam ?? cameras[0]!
}

export function rememberCamera(camera: Camera): void {
  localStorage.setItem(REMEMBERED_KEY, camera.label)
}

/** What the driver actually handed us, as opposed to what we asked for. */
export interface StreamMode {
  width: number
  height: number
  frameRate: number
  /**
   * 'none' means Chrome is passing the driver's own frames through; anything
   * else means it synthesised the size by cropping and scaling. Diagnostic
   * only — it is not sufficient to prove full resolution, see `full`.
   */
  resizeMode: string
  /** The device's advertised maximum, for comparison. */
  maxWidth: number
  maxHeight: number
  /** Are we getting every pixel the device claims to have? */
  full: boolean
}

/**
 * Describe what a track is really delivering.
 *
 * `full` deliberately compares the delivered size against the advertised
 * maximum rather than trusting `resizeMode`. This camera has been observed
 * wedged in a 640x480 mode — after which AVFoundation listed no supported modes
 * at all, so the hang is below the browser — while still reporting
 * `resizeMode: 'none'` and capabilities of 3840x3104. Both of the obvious
 * "am I at full resolution?" signals said yes, and both were wrong. Only the
 * delivered numbers are trustworthy.
 */
export function streamMode(track: MediaStreamTrack): StreamMode {
  // resizeMode is in the Media Capture spec and Chrome reports it, but it is
  // missing from TypeScript's MediaTrackSettings.
  const s = track.getSettings() as MediaTrackSettings & { resizeMode?: string }
  const caps = track.getCapabilities?.() ?? {}
  const maxWidth = caps.width?.max ?? 0
  const maxHeight = caps.height?.max ?? 0
  const width = s.width ?? 0
  const height = s.height ?? 0
  return {
    width,
    height,
    frameRate: Math.round(s.frameRate ?? 0),
    resizeMode: s.resizeMode ?? 'unknown',
    maxWidth,
    maxHeight,
    full: maxWidth > 0 && width >= maxWidth && height >= maxHeight,
  }
}

/**
 * Open a stream at the device's true native resolution.
 *
 * Two traps here, both measured on this station rather than assumed:
 *
 * Asking for a fixed 3840x2160 was actively harmful — that is 16:9, the OKIOCAM
 * is natively 3840x3104 (~1.24:1), and requesting an aspect it does not have
 * let Chrome fall back to a much smaller mode, silently and not every time.
 *
 * Worse, Chrome satisfies *any* size you ask for, `exact` included: it reports
 * a clean 2560x1440 or 3840x2160 while quietly crop-and-scaling the one real
 * sensor mode down to fit. A successful constraint is therefore no evidence of
 * native resolution at all. The only honest signal is `resizeMode`, which reads
 * 'none' for the native mode and 'crop-and-scale' for every synthesised one —
 * on this camera exactly one size, 3840x3104, comes back as 'none'.
 *
 * So: probe the reported maximum, ask for exactly that, and verify. The
 * throwaway stream is the only way to read capabilities, since they are a
 * property of a live track rather than of the device.
 */
export async function startStream(deviceId: string): Promise<MediaStream> {
  let max: { width: number; height: number } | null = null

  try {
    const probe = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } })
    const caps = probe.getVideoTracks()[0]?.getCapabilities?.()
    probe.getTracks().forEach((t) => t.stop())
    if (caps?.width?.max && caps.height?.max) {
      max = { width: caps.width.max, height: caps.height.max }
    }
  } catch {
    // Fall through to an unconstrained request rather than failing outright.
  }

  // `exact` first: if the maximums come from two different modes (they coincide
  // on this camera, but need not in general) we want a clean failure rather
  // than a silently downscaled composite.
  const attempts: MediaTrackConstraints[] = []
  if (max) {
    attempts.push({ deviceId: { exact: deviceId }, width: { exact: max.width }, height: { exact: max.height } })
    attempts.push({ deviceId: { exact: deviceId }, width: { ideal: max.width }, height: { ideal: max.height } })
  }
  attempts.push({ deviceId: { exact: deviceId } })

  let lastErr: unknown
  for (const video of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video })
      const track = stream.getVideoTracks()[0]
      if (track) {
        const mode = streamMode(track)
        // Not fatal — a small stream still captures — but it means this station
        // is not getting the pixels it thinks it is, which is the difference
        // between a legible worksheet and an unreadable one. The UI surfaces
        // this too; the log is for whoever is reading a stored capture later.
        if (!mode.full) console.warn('[camera] below native resolution', mode)
      }
      return stream
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Could not open the camera')
}

export interface CapturedFrame {
  base64: string
  mimeType: string
  width: number
  height: number
  /** Source frame dimensions, before cropping or downscaling. */
  sourceWidth: number
  sourceHeight: number
  /** Focus of the stored crop, plus how the shutter decided to fire. */
  focus: {
    /** Score of the frame actually kept, measured on the cropped output. */
    chosen: number
    /** Every candidate in the burst, sharpest-first decision visible. */
    candidates: number[]
    /** Whether autofocus settled before the burst, and how long that took. */
    gate: FocusGate
  }
}

/**
 * Draw a crop of `source` into `canvas`, rotated upright and downscaled.
 *
 * Split out from captureFrame because best-of-N needs to run it repeatedly, and
 * because scoring the result — rather than the source frame — is what makes the
 * recorded focus number describe the image we actually store.
 */
function drawCrop(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  width: number,
  height: number,
  crop: Region | undefined,
  quarterTurns: 0 | 1 | 2 | 3,
  maxEdge: number,
): void {
  // Crop in normalized space rather than pixels, so the rect stays meaningful
  // whatever the source resolution turns out to be.
  const region = crop
    ? {
        sx: Math.round(crop.x * width),
        sy: Math.round(crop.y * height),
        sw: Math.round(crop.width * width),
        sh: Math.round(crop.height * height),
      }
    : { sx: 0, sy: 0, sw: width, sh: height }

  const scale = Math.min(1, maxEdge / Math.max(region.sw, region.sh))
  const drawW = Math.round(region.sw * scale)
  const drawH = Math.round(region.sh * scale)

  // A quarter turn swaps the output's axes: a sideways letter page cropped to
  // 2400x1855 is stored as an upright 1855x2400.
  const swap = quarterTurns % 2 === 1
  canvas.width = swap ? drawH : drawW
  canvas.height = swap ? drawW : drawH

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a 2D canvas context')

  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((quarterTurns * Math.PI) / 2)
  ctx.drawImage(source, region.sx, region.sy, region.sw, region.sh, -drawW / 2, -drawH / 2, drawW, drawH)
  ctx.restore()
}

/**
 * Grab a frame, cropped to the page, upright, downscaled so the long edge is at
 * most `maxEdge`.
 *
 * 2400px keeps a full letter page around 220 DPI — ample for handwriting, a QR
 * header, and Chinese characters — while landing the base64 payload inside
 * Vercel's request body limit, which a raw 11.9MP frame would not. Cropping
 * first means those pixels land on the page rather than on the desk.
 *
 * The pixels come from the preview, and only from the preview.
 * ImageCapture.takePhoto() used to be consulted here on the belief that it read
 * the sensor at a higher resolution than the preview offered. Measured on this
 * station, it does not: getPhotoCapabilities() reports imageWidth min = max =
 * 3840 and imageHeight min = max = 3104, which is exactly what the preview
 * already delivers. What takePhoto() does cost is ~3.2s per call and a camera
 * reconfiguration that restarts the autofocus sweep — a settled preview
 * measured 1684 before a takePhoto() and 119 immediately after, taking a
 * further ~2s to recover. It was buying nothing and destroying focus, so it is
 * gone.
 */
export async function captureFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  /** Normalized 0–1 crop, applied to the source frame. */
  crop?: Region,
  /** Quarter-turns clockwise to bring the page upright after cropping. */
  quarterTurns: 0 | 1 | 2 | 3 = 0,
  maxEdge = 2400,
  /** Called while waiting on autofocus, so the UI can say what is happening. */
  onWaiting?: (gate: { ms: number; score: number }) => void,
): Promise<CapturedFrame> {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) throw new Error('Camera produced an empty frame')

  // Scratch canvas so a candidate can be scored at full output geometry without
  // disturbing the best frame kept so far.
  const scratch = document.createElement('canvas')
  const measure = (): number => {
    drawCrop(scratch, video, width, height, crop, quarterTurns, maxEdge)
    return focusScore(scratch, scratch.width, scratch.height)
  }

  // 1. Let autofocus settle. On a stream that has been live a while this costs
  //    the length of the stability window (~1.2s); on a cold one it waits out
  //    the sweep, ~6s.
  const gate = await waitForStableFocus(() => {
    const score = measure()
    onWaiting?.({ ms: 0, score })
    return score
  })

  // 2. Best of N. The gate makes a badly defocused frame unlikely; the burst
  //    covers the residual jitter, and costs ~25ms per candidate because only
  //    the winner is ever JPEG-encoded.
  const candidates: number[] = []
  let best = -1
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a 2D canvas context')

  for (let i = 0; i < 4; i++) {
    const score = measure()
    candidates.push(score)
    if (score > best) {
      best = score
      canvas.width = scratch.width
      canvas.height = scratch.height
      ctx.drawImage(scratch, 0, 0)
    }
    if (i < 3) await new Promise((r) => setTimeout(r, 150))
  }

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
  return {
    base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
    mimeType: 'image/jpeg',
    width: canvas.width,
    height: canvas.height,
    sourceWidth: width,
    sourceHeight: height,
    focus: { chosen: best, candidates, gate },
  }
}

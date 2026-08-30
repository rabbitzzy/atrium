/**
 * Camera selection and frame capture.
 *
 * The kiosk station has at least two cameras: the host machine's built-in
 * webcam and the overhead document camera. getUserMedia() with no deviceId
 * picks the built-in one, which points at the student's face rather than the
 * paper — so device selection is required, not a nicety.
 */

import { focusProfile, waitForStableFocus, type FocusGate, type Region } from './focus'
import { detectPage, type Point, type Quad } from './page-detect'
import { warpQuad } from './warp'

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
 *
 * The probe asks for the rear camera. On a phone `{ video: true }` opens the
 * front one, so the permission prompt and the first frames were a picture of
 * the child's face — before any selection had happened. `ideal` rather than
 * `exact` because a laptop has no environment-facing camera and must not fail
 * here.
 */
export async function listCameras(): Promise<Camera[]> {
  const probe = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
  })
  probe.getTracks().forEach((t) => t.stop())

  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }))
}

/**
 * Is this the lens pointing at the student, on a device that has another one?
 *
 * `facingMode` is the only non-guess available. It is a standard track setting
 * the platform fills in — "user" or "environment" — so it means the same thing
 * on an iPhone, on an Android, and on whatever the school buys next, with no
 * dependence on what the vendor decided to name the hardware. Labels are the
 * fallback for devices that report no facing at all, which is every USB
 * document camera and laptop webcam.
 *
 * `undefined` is not a failure: a webcam that reports nothing is accepted,
 * because on that machine there is no better answer to hold out for.
 */
export function isFacingStudent(facingMode: string | undefined): boolean {
  return facingMode === 'user'
}

/** The station's overhead camera — the only one certainly aimed at paper. */
const DOC_CAM = /okiocam|ipevo|elmo|document/i
/** What a phone calls the camera on the back of it. */
const REAR = /back|rear|environment|后置/i
/**
 * …and the one pointed at the face, which must never be picked on a phone.
 *
 * Deliberately narrow. The first version matched bare `face`, which also
 * matches "FaceTime HD Camera" — a perfectly good webcam, and on a station the
 * one an operator may have chosen on purpose. Matching it as front-facing threw
 * that choice away. These are the words a device uses when it means the lens
 * pointing at the person: "Front Camera" on iOS, "facing front" on Android.
 */
const FRONT = /(^|\W)(front|selfie)(\W|$)|facing front|user facing|前置/i

/**
 * Pick the camera to use on load.
 *
 * Matches on label rather than deviceId: macOS rotates deviceId when a USB
 * camera is replugged, but the label ("OKIOCAM S2 Pro") is stable.
 *
 * The order is a station first, then a phone. A document camera is the most
 * specific thing we can recognise and the only one that is certainly pointed
 * at paper. Failing that, anything the device calls a back camera — on an
 * iPhone `cameras[0]` is the front one, so falling straight through to it
 * pointed the kiosk at the child instead of their work, with nothing in the UI
 * to correct it. Last of all the first device, which is only reached when
 * nothing is labelled either way.
 */
export function preferredCamera(cameras: Camera[]): Camera | null {
  if (cameras.length === 0) return null

  const remembered = localStorage.getItem(REMEMBERED_KEY)
  if (remembered) {
    const match = cameras.find((c) => c.label === remembered)
    // A remembered front camera is not a preference, it is a record of this
    // bug: `rememberCamera` runs after every successful stream, so a single
    // session that opened the front lens pinned it for every session after —
    // including every session since this heuristic was added, which is why
    // fixing the ordering alone changed nothing on a phone already stuck.
    if (match && !(FRONT.test(match.label) && cameras.some((c) => !FRONT.test(c.label)))) {
      return match
    }
  }

  const docCam = cameras.find((c) => DOC_CAM.test(c.label))
  if (docCam) return docCam

  const rear = cameras.find((c) => REAR.test(c.label) && !FRONT.test(c.label))
  if (rear) return rear

  // Better nothing recognisable than something known to be wrong.
  const notFront = cameras.find((c) => !FRONT.test(c.label))
  return notFront ?? cameras[0]!
}

export function rememberCamera(camera: Camera): void {
  // Remembering the front camera is how a phone gets stuck on it, and there is
  // no case where the station should deliberately reopen the lens pointed at
  // the student.
  if (FRONT.test(camera.label)) return
  localStorage.setItem(REMEMBERED_KEY, camera.label)
}

const ASPECT_KEY = 'atrium.camera.aspect'

/**
 * The shape of the last frame this station saw, remembered across visits.
 *
 * It exists so the placeholder can be laid out at the size the camera is about
 * to be. A video element has no dimensions until `loadedmetadata` fires, so a
 * box sized from the stream is a box that appears late, and the screen visibly
 * grows into it. A box sized from what this camera was last time is the right
 * size before the camera has opened at all — and the shape of a fixed-mounted
 * document camera does not change between one child and the next.
 *
 * 4:3 on a station that has never run, which is right often enough and wrong
 * by a single small reflow when it is not.
 */
export function rememberAspect(width: number, height: number): void {
  if (width > 0 && height > 0) localStorage.setItem(ASPECT_KEY, String(width / height))
}

export function lastAspect(): number {
  const stored = Number(localStorage.getItem(ASPECT_KEY))
  return Number.isFinite(stored) && stored > 0 ? stored : 4 / 3
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
export async function startStream(camera: Camera): Promise<MediaStream> {
  const { deviceId, label } = camera
  const documentCamera = DOC_CAM.test(label)
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

  /*
   * On a phone, ask by facing rather than by device.
   *
   * Picking the rear camera by deviceId is what a station does, and iOS does
   * not reliably honour it: the label read "Back Camera", the id belonged to
   * it, and Safari opened the front lens regardless. `facingMode: exact` is the
   * constraint it does respect. So it goes first for anything that is not a
   * document camera, and fails harmlessly on a laptop with no environment
   * facing lens — one refused request, then the deviceId path below.
   */
  if (!documentCamera) {
    if (max) {
      attempts.push({
        facingMode: { exact: 'environment' },
        width: { ideal: max.width },
        height: { ideal: max.height },
      })
    }
    attempts.push({ facingMode: { exact: 'environment' } })
  }

  if (max) {
    attempts.push({ deviceId: { exact: deviceId }, width: { exact: max.width }, height: { exact: max.height } })
    attempts.push({ deviceId: { exact: deviceId }, width: { ideal: max.width }, height: { ideal: max.height } })
  }
  attempts.push({ deviceId: { exact: deviceId } })
  // If that device has gone away — a phone rotating ids between sessions, a
  // camera unplugged — take the rear camera rather than whatever is default,
  // which on a phone is the one facing the child.
  attempts.push({ facingMode: { ideal: 'environment' } })

  let lastErr: unknown
  /*
   * A front-facing stream is kept, not returned, until every other attempt has
   * been tried. Some devices really do have only a front camera, and a station
   * that refuses to open anything is worse than one pointed the wrong way — but
   * it is the last answer, never the first.
   */
  let facingStudent: MediaStream | null = null

  for (const video of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video })
      const track = stream.getVideoTracks()[0]

      /*
       * Check what actually opened, rather than trusting what was asked for.
       *
       * This is the part that does not guess. Constraints are a request and
       * `getSettings()` is the answer: it reports the facing of the track the
       * platform really gave us. A device that ignores `facingMode` — as iOS
       * did when asked by deviceId — is caught here instead of quietly
       * photographing the child.
       */
      if (track && !documentCamera && isFacingStudent(track.getSettings().facingMode)) {
        if (facingStudent) stream.getTracks().forEach((t) => t.stop())
        else facingStudent = stream
        continue
      }

      if (track) {
        const mode = streamMode(track)
        // Not fatal — a small stream still captures — but it means this station
        // is not getting the pixels it thinks it is, which is the difference
        // between a legible capture and an unreadable one. The UI surfaces
        // this too; the log is for whoever is reading a stored capture later.
        if (!mode.full) console.warn('[camera] below native resolution', mode)
      }
      return stream
    } catch (err) {
      lastErr = err
    }
  }

  if (facingStudent) {
    console.warn('[camera] only a front-facing camera is available')
    return facingStudent
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
  /** How the page was framed: found by its edges, or fallen back to the guide. */
  crop: Framing
}

/** How one frame ended up being cropped. */
export interface Framing {
  method: 'detected' | 'fixed'
  /** The corners used, when they were found. */
  quad: Quad | null
  /** Why detection was not used, when it was not. */
  reason: string | null
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
  /** Fallback crop, used when the page's own edges cannot be found. */
  crop?: Region,
  /** Quarter-turns clockwise to bring the page upright. */
  quarterTurns: 0 | 1 | 2 | 3 = 0,
  maxEdge = 2400,
  /** The paper's portrait aspect (short edge / long edge), e.g. 8.5/11. */
  paperAspect?: number,
): Promise<CapturedFrame> {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) throw new Error('Camera produced an empty frame')

  // Counter-clockwise turns bring the page upright; the caller thinks in
  // clockwise ones because that is how the on-screen control reads.
  const ccwTurns = (4 - (quarterTurns % 4)) % 4

  /**
   * Size the deskewed output from the page we actually found.
   *
   * Whether the sheet is portrait or landscape is measured, not declared. A
   * student can lay a letter page either way and draw on it either way, and the
   * pageUp control only says which edge is the top — it cannot distinguish "a
   * portrait page turned sideways" from "a landscape page the right way up".
   * Measuring the quad settles it, and snapping to the paper's true ratio
   * corrects the residual aspect error the lens introduces.
   */
  const outSize = (quad: Quad) => {
    const side = (a: Point, b: Point) =>
      Math.hypot((a.x - b.x) * width, (a.y - b.y) * height)
    const quadW = (side(quad.tl, quad.tr) + side(quad.bl, quad.br)) / 2
    const quadH = (side(quad.tl, quad.bl) + side(quad.tr, quad.br)) / 2

    // The quad is measured in the frame; a quarter turn swaps its axes.
    const upright = ccwTurns % 2 === 1 ? quadH / quadW : quadW / quadH
    const portrait = paperAspect ?? upright
    const landscape = 1 / portrait
    const aspect =
      Math.abs(upright - portrait) <= Math.abs(upright - landscape) ? portrait : landscape

    return aspect >= 1
      ? { w: maxEdge, h: Math.round(maxEdge / aspect) }
      : { w: Math.round(maxEdge * aspect), h: maxEdge }
  }

  // Scratch canvas so a candidate can be scored at full output geometry without
  // disturbing the best frame kept so far.
  const scratch = document.createElement('canvas')

  /**
   * Frame one candidate. Detection is re-run per candidate rather than once,
   * because a student's hand leaving the frame between the gate and the last
   * shot changes what the page looks like — and the frame we keep should be
   * cropped by its own geometry, not by an earlier frame's.
   */
  const frameOne = (
    /** Corners already found this capture, to skip re-detecting a still page. */
    reuse?: { quad: Quad | null; reason: string | null },
  ): Framing => {
    const found = reuse ?? detectPage(video, width, height)
    if (found.quad) {
      const { w, h } = outSize(found.quad)
      warpQuad(scratch, video, width, height, found.quad, ccwTurns, w, h)
      return { method: 'detected', quad: found.quad, reason: null }
    }
    drawCrop(scratch, video, width, height, crop, quarterTurns, maxEdge)
    return { method: 'fixed', quad: null, reason: found.reason }
  }

  /**
   * Sharpest tile, not the 90th percentile.
   *
   * Both the gate and the burst ranking ask about the same page, and on a
   * part-done page most of that page is blank. A percentile then measures
   * blank paper: one genuinely sharp page holding a single line of pencil
   * scored p90 101 with tiles jittering between 25 and 45, which is far outside
   * the gate's tolerance — so it never locked and timed out at 10.7s on an
   * image that was perfectly readable. The sharpest tile scored 434 on the same
   * frame, and is steady, because it tracks the content rather than the paper.
   */
  const measure = (reuse?: Framing): number => {
    frameOne(reuse)
    return focusProfile(scratch, scratch.width, scratch.height).best
  }

  // 1. Let autofocus settle. On a stream that has been live a while this costs
  //    the length of the stability window (~1.2s); on a cold one it waits out
  //    the sweep, ~6s.
  //
  //    The page is stationary through the wait — that is the entire premise of
  //    waiting — so its corners are found once and reused for every sample.
  //    Re-detecting each time cost ~100ms a sample and stretched a 1.2s gate to
  //    5.5s, which is time a student spends staring at a spinner for no gain.
  const settled = frameOne()
  const gate = await waitForStableFocus(() => measure(settled))

  // 2. Best of N. The gate makes a badly defocused frame unlikely; the burst
  //    covers the residual jitter, and only the winner is ever JPEG-encoded.
  const candidates: number[] = []
  let best = -1
  let bestCrop: Framing = { method: 'fixed', quad: null, reason: 'no candidate' }
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a 2D canvas context')

  for (let i = 0; i < 4; i++) {
    // Detected afresh per candidate, unlike the gate: a hand withdrawing between
    // the gate releasing and the last shot changes where the page is, and the
    // frame we keep should be cropped by its own geometry rather than by one
    // measured seconds earlier.
    const framing = frameOne()
    const score = focusProfile(scratch, scratch.width, scratch.height).best
    candidates.push(score)
    if (score > best) {
      best = score
      bestCrop = framing
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
    crop: bestCrop,
  }
}

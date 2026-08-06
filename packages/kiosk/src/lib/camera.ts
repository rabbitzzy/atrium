/**
 * Camera selection and frame capture.
 *
 * The kiosk station has at least two cameras: the host machine's built-in
 * webcam and the overhead document camera. getUserMedia() with no deviceId
 * picks the built-in one, which points at the student's face rather than the
 * paper — so device selection is required, not a nicety.
 */

import { PHOTO_FOCUS_TOLERANCE, focusScore } from './focus'

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

/**
 * Open a stream at the device's own maximum resolution.
 *
 * Asking for a fixed 3840x2160 was actively harmful: that is 16:9, the OKIOCAM
 * is natively 3840x3104 (~1.24:1), and requesting an aspect it does not have
 * let Chrome fall all the way back to a 640x480 mode — silently, and not every
 * time, so captures varied between 2000px and 640px wide across sessions.
 *
 * So probe first and ask for exactly what the device reports. The throwaway
 * stream is the only way to read capabilities, since they are a property of a
 * live track rather than of the device.
 */
export async function startStream(deviceId: string): Promise<MediaStream> {
  let ideal: { width: number; height: number } | null = null

  try {
    const probe = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } })
    const caps = probe.getVideoTracks()[0]?.getCapabilities?.()
    probe.getTracks().forEach((t) => t.stop())
    if (caps?.width?.max && caps.height?.max) {
      ideal = { width: caps.width.max, height: caps.height.max }
    }
  } catch {
    // Fall through to an unconstrained request rather than failing outright.
  }

  return navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: { exact: deviceId },
      ...(ideal ? { width: { ideal: ideal.width }, height: { ideal: ideal.height } } : {}),
    },
  })
}

export interface CapturedFrame {
  base64: string
  mimeType: string
  width: number
  height: number
  /** Source frame dimensions, before cropping or downscaling. */
  sourceWidth: number
  sourceHeight: number
  /** Which path produced the pixels — worth recording, since they differ ~6x. */
  via: 'photo' | 'preview'
  /** Focus score of the chosen source, and of the one rejected. */
  focus: { chosen: number; photo: number | null; preview: number | null }
}

/**
 * Get the best available still from a live track — measured, not assumed.
 *
 * There are two sources and neither reliably wins:
 *
 *   takePhoto() reads the sensor, giving 3840x3104 where the preview gives
 *   640x480 — but it does not wait for autofocus to converge, and here
 *   station it measured ~34x less sharp than the preview. More pixels of a
 *   blurrier page is not a better capture.
 *
 *   The preview buffer is lower resolution but reflects whatever autofocus has
 *   actually settled on.
 *
 * So take both, score both on a size-normalised metric, and keep the photo
 * unless it is materially less sharp. Ties and near-ties go to the photo
 * because its extra pixels are worth real quality — the preview only wins the
 * genuinely-defocused case. That also means the production Chromebox discovers
 * its own answer rather than inheriting a macOS measurement.
 */
async function grabSource(
  video: HTMLVideoElement,
  track: MediaStreamTrack | null,
): Promise<{
  source: CanvasImageSource
  width: number
  height: number
  via: 'photo' | 'preview'
  focus: { photo: number | null; preview: number | null }
}> {
  const preview = {
    source: video as CanvasImageSource,
    width: video.videoWidth,
    height: video.videoHeight,
  }
  const previewScore = preview.width ? focusScore(preview.source, preview.width, preview.height) : 0

  if (track && 'ImageCapture' in window) {
    try {
      const blob = await new ImageCapture(track).takePhoto()
      const bitmap = await createImageBitmap(blob)
      const photoScore = focusScore(bitmap, bitmap.width, bitmap.height)

      if (photoScore >= previewScore * PHOTO_FOCUS_TOLERANCE) {
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          via: 'photo',
          focus: { photo: photoScore, preview: previewScore },
        }
      }
      bitmap.close()
      return { ...preview, via: 'preview', focus: { photo: photoScore, preview: previewScore } }
    } catch {
      // Some drivers advertise ImageCapture and then refuse takePhoto.
    }
  }

  return { ...preview, via: 'preview', focus: { photo: null, preview: previewScore } }
}

/**
 * Grab a frame, optionally cropped to a region, downscaled so the long edge is
 * at most `maxEdge`.
 *
 * 2400px keeps a full letter page around 220 DPI — ample for handwriting, a QR
 * header, and Chinese characters — while landing the base64 payload inside
 * Vercel's request body limit, which a raw 11.9MP frame would not. Cropping
 * first means those pixels land on the page rather than on the desk.
 */
export async function captureFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  track: MediaStreamTrack | null,
  /** Normalized 0–1 crop, applied to whichever source we end up with. */
  crop?: { x: number; y: number; width: number; height: number },
  /** Quarter-turns clockwise to bring the page upright after cropping. */
  quarterTurns: 0 | 1 | 2 | 3 = 0,
  maxEdge = 2400,
): Promise<CapturedFrame> {
  const { source, width, height, via, focus } = await grabSource(video, track)
  if (!width || !height) throw new Error('Camera produced an empty frame')

  // Crop in normalized space rather than pixels, because the photo and the
  // preview have different dimensions — a pixel rect measured against the
  // preview would be meaningless against a 6x larger still.
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
  if (source instanceof ImageBitmap) source.close()

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
  return {
    base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
    mimeType: 'image/jpeg',
    width: canvas.width,
    height: canvas.height,
    sourceWidth: width,
    sourceHeight: height,
    via,
    focus: { chosen: (via === 'photo' ? focus.photo : focus.preview) ?? 0, ...focus },
  }
}

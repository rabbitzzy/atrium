/**
 * Camera selection and frame capture.
 *
 * The kiosk station has at least two cameras: the host machine's built-in
 * webcam and the overhead document camera. getUserMedia() with no deviceId
 * picks the built-in one, which points at the student's face rather than the
 * paper — so device selection is required, not a nicety.
 */

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
}

/**
 * Get the best available still from a live track.
 *
 * ImageCapture.takePhoto() reads the sensor rather than the preview buffer, and
 * on the OKIOCAM that is the difference between 3840x3104 and 640x480 — it
 * returns full resolution even when the preview stream has negotiated down to
 * VGA, which it does unpredictably on macOS. grabFrame() is no help here; it
 * reads the same preview buffer the canvas path does.
 *
 * Falls back to the video element because ImageCapture is Chromium-only, and
 * a capture at low resolution beats no capture at all.
 */
async function grabSource(
  video: HTMLVideoElement,
  track: MediaStreamTrack | null,
): Promise<{ source: CanvasImageSource; width: number; height: number; via: 'photo' | 'preview' }> {
  if (track && 'ImageCapture' in window) {
    try {
      const blob = await new ImageCapture(track).takePhoto()
      const bitmap = await createImageBitmap(blob)
      return { source: bitmap, width: bitmap.width, height: bitmap.height, via: 'photo' }
    } catch {
      // Some drivers advertise ImageCapture and then refuse takePhoto.
    }
  }
  return {
    source: video,
    width: video.videoWidth,
    height: video.videoHeight,
    via: 'preview',
  }
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
  maxEdge = 2400,
): Promise<CapturedFrame> {
  const { source, width, height, via } = await grabSource(video, track)
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
  canvas.width = Math.round(region.sw * scale)
  canvas.height = Math.round(region.sh * scale)

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a 2D canvas context')
  ctx.drawImage(source, region.sx, region.sy, region.sw, region.sh, 0, 0, canvas.width, canvas.height)
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
  }
}

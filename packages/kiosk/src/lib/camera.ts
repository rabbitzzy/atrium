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

export async function startStream(deviceId: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: { exact: deviceId },
      // Ask for the document camera's full sensor. It negotiates down on
      // devices that can't deliver this.
      width: { ideal: 3840 },
      height: { ideal: 2160 },
    },
  })
}

export interface CapturedFrame {
  base64: string
  mimeType: string
  width: number
  height: number
}

/**
 * Grab a frame, downscaled so the long edge is at most `maxEdge`.
 *
 * 2000px keeps handwriting and a QR header comfortably legible while landing
 * the base64 payload well inside Vercel's request body limit — a raw 13MP
 * frame from the OKIOCAM would not.
 */
export function captureFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  maxEdge = 2000,
): CapturedFrame {
  const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight))
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a 2D canvas context')
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
  return {
    base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
    mimeType: 'image/jpeg',
    width: canvas.width,
    height: canvas.height,
  }
}

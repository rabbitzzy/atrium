/**
 * Camera focus lab — a dev-only bench for measuring what this station's camera
 * actually does, rather than what its datasheet or a previous session claimed.
 *
 * Not part of the kiosk build (vite only bundles index.html); reachable at
 * /focus-lab.html on the dev server. Every function returns plain JSON so it
 * can be driven from the console or from browser automation.
 */

import { focusProfile, type Region } from '../lib/focus'
import { cropRegion, defaultPageUp, orientationFor } from '../lib/paper'

const video = document.getElementById('video') as HTMLVideoElement
const guideEl = document.getElementById('guide') as HTMLDivElement
const readout = document.getElementById('readout') as HTMLDivElement
const logEl = document.getElementById('log') as HTMLDivElement

let stream: MediaStream | null = null
let track: MediaStreamTrack | null = null
let watchTimer: number | null = null

function log(...parts: unknown[]): void {
  const line = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')
  logEl.textContent = `${line}\n${logEl.textContent}`.slice(0, 20000)
  console.log('[lab]', line)
}

/** The production crop: letter page laid the way this camera's frame wants it. */
function region(): Region {
  const w = video.videoWidth || 4
  const h = video.videoHeight || 3
  return cropRegion('letter', orientationFor(defaultPageUp(w, h)), w, h)
}

function drawGuide(): void {
  const r = region()
  const box = video.getBoundingClientRect()
  const stage = document.getElementById('stage')!.getBoundingClientRect()
  guideEl.style.left = `${box.left - stage.left + r.x * box.width}px`
  guideEl.style.top = `${box.top - stage.top + r.y * box.height}px`
  guideEl.style.width = `${r.width * box.width}px`
  guideEl.style.height = `${r.height * box.height}px`
}

function score(source: CanvasImageSource, w: number, h: number, whole = false) {
  return focusProfile(source, w, h, whole ? undefined : region())
}

async function devices() {
  const probe = await navigator.mediaDevices.getUserMedia({ video: true })
  probe.getTracks().forEach((t) => t.stop())
  const list = await navigator.mediaDevices.enumerateDevices()
  return list.filter((d) => d.kind === 'videoinput').map((d) => ({ deviceId: d.deviceId, label: d.label }))
}

/**
 * Open a camera. With no size given, asks for the device's reported maximum —
 * which is the thing worth verifying, since a request the device cannot honour
 * is silently downgraded rather than refused.
 */
async function open(labelMatch = 'okiocam', size?: { width: number; height: number; exact?: boolean }) {
  close()
  const found = await devices()
  const dev = found.find((d) => new RegExp(labelMatch, 'i').test(d.label)) ?? found[0]
  if (!dev) throw new Error('no camera')

  let want = size
  if (!want) {
    const p = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: dev.deviceId } } })
    const caps = p.getVideoTracks()[0]!.getCapabilities()
    p.getTracks().forEach((t) => t.stop())
    if (caps.width?.max && caps.height?.max) want = { width: caps.width.max, height: caps.height.max }
  }

  const constraint: MediaTrackConstraints = { deviceId: { exact: dev.deviceId } }
  if (want) {
    const mode = want.exact ? 'exact' : 'ideal'
    constraint.width = { [mode]: want.width }
    constraint.height = { [mode]: want.height }
  }

  stream = await navigator.mediaDevices.getUserMedia({ video: constraint })
  track = stream.getVideoTracks()[0]!
  video.srcObject = stream
  await new Promise((res) => {
    video.onloadedmetadata = res
  })
  await video.play().catch(() => {})
  setTimeout(drawGuide, 100)

  let photoCaps: unknown = 'unavailable'
  let photoSettings: unknown = 'unavailable'
  if ('ImageCapture' in window) {
    try {
      const ic = new ImageCapture(track)
      photoCaps = await ic.getPhotoCapabilities()
      photoSettings = await ic.getPhotoSettings()
    } catch (e) {
      photoCaps = `error: ${(e as Error).message}`
    }
  }

  return {
    device: dev.label,
    settings: track.getSettings(),
    capabilities: track.getCapabilities(),
    videoSize: { w: video.videoWidth, h: video.videoHeight },
    supportedConstraints: navigator.mediaDevices.getSupportedConstraints(),
    photoCaps,
    photoSettings,
  }
}

function close(): void {
  stopWatch()
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  track = null
}

/**
 * Ask for a ladder of sizes and report what the driver actually delivered.
 *
 * The point is the gap: a mode can be requested as `ideal` and quietly satisfied
 * by something far smaller, which is exactly how this station ended up capturing
 * 640x480 while believing it had 4K. `exact` is asked separately because a mode
 * that refuses is honest, and a mode that downgrades is not.
 */
async function probeResolutions(labelMatch = 'okiocam') {
  const found = await devices()
  const dev = found.find((d) => new RegExp(labelMatch, 'i').test(d.label)) ?? found[0]
  if (!dev) throw new Error('no camera')

  const ladder = [
    [640, 480], [1280, 720], [1280, 960], [1600, 1200], [1920, 1080], [1920, 1440],
    [2560, 1440], [2592, 1944], [3264, 2448], [3840, 2160], [3840, 3104], [4032, 3024],
    [8000, 8000],
  ]

  const results: unknown[] = []
  for (const [w, h] of ladder) {
    for (const mode of ['exact', 'ideal'] as const) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: dev.deviceId }, width: { [mode]: w }, height: { [mode]: h } },
        })
        const t = s.getVideoTracks()[0]!
        const got = t.getSettings()
        s.getTracks().forEach((x) => x.stop())
        results.push({
          asked: `${w}x${h}`,
          mode,
          got: `${got.width}x${got.height}`,
          fps: got.frameRate,
          match: got.width === w && got.height === h,
        })
      } catch (e) {
        results.push({ asked: `${w}x${h}`, mode, error: (e as Error).name })
      }
      await new Promise((r) => setTimeout(r, 120))
    }
  }
  return results
}

/** Live on-screen score, so a human can see focus move in real time. */
function watch(): void {
  stopWatch()
  watchTimer = window.setInterval(() => {
    if (!video.videoWidth) return
    const crop = score(video, video.videoWidth, video.videoHeight)
    const whole = score(video, video.videoWidth, video.videoHeight, true)
    readout.textContent = `${video.videoWidth}x${video.videoHeight}  crop p90 ${crop.p90}   whole-frame p90 ${whole.p90}`
    drawGuide()
  }, 300)
}

function stopWatch(): void {
  if (watchTimer !== null) clearInterval(watchTimer)
  watchTimer = null
}

/**
 * Sample the preview's focus over time.
 *
 * The whole question this lab exists for: does autofocus settle and stay, or
 * does it wander? A time series answers that; a single capture cannot.
 */
async function series({ seconds = 20, hz = 4 } = {}) {
  const samples: { t: number; crop: number; whole: number }[] = []
  const t0 = performance.now()
  const step = 1000 / hz
  while (performance.now() - t0 < seconds * 1000) {
    const t = Math.round(performance.now() - t0)
    samples.push({
      t,
      crop: score(video, video.videoWidth, video.videoHeight).p90,
      whole: score(video, video.videoWidth, video.videoHeight, true).p90,
    })
    readout.textContent = `series ${t}ms  crop ${samples[samples.length - 1]!.crop}`
    await new Promise((r) => setTimeout(r, step))
  }
  const crops = samples.map((s) => s.crop)
  const sorted = [...crops].sort((a, b) => a - b)
  const summary = {
    n: crops.length,
    min: sorted[0],
    p10: sorted[Math.floor(0.1 * (sorted.length - 1))],
    median: sorted[Math.floor(0.5 * (sorted.length - 1))],
    p90: sorted[Math.floor(0.9 * (sorted.length - 1))],
    max: sorted[sorted.length - 1],
    spread: Math.round((sorted[sorted.length - 1]! / Math.max(1, sorted[0]!)) * 10) / 10,
  }
  log('series', summary)
  return { summary, samples }
}

/** Fire takePhoto N times and score each, against the same crop as the preview. */
async function photoBurst(n = 5, gapMs = 400) {
  if (!track) throw new Error('open() first')
  const out: unknown[] = []
  for (let i = 0; i < n; i++) {
    const previewBefore = score(video, video.videoWidth, video.videoHeight).p90
    const t0 = performance.now()
    try {
      const ic = new ImageCapture(track)
      const blob = await ic.takePhoto()
      const bmp = await createImageBitmap(blob)
      const p = score(bmp, bmp.width, bmp.height)
      out.push({
        i,
        ms: Math.round(performance.now() - t0),
        size: `${bmp.width}x${bmp.height}`,
        photo: p.p90,
        preview: previewBefore,
        tiles: p.tiles,
      })
      bmp.close()
    } catch (e) {
      out.push({ i, error: (e as Error).name + ': ' + (e as Error).message })
    }
    await new Promise((r) => setTimeout(r, gapMs))
  }
  log('photoBurst', out)
  return out
}

/** Does any focus control exist on this device? Asked by trying, not by trusting. */
async function tryFocusControls() {
  if (!track) throw new Error('open() first')
  const caps = track.getCapabilities() as Record<string, unknown>
  const attempts: unknown[] = []
  const tests: MediaTrackConstraints[] = [
    { advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet] },
    { advanced: [{ focusMode: 'manual', focusDistance: 0.3 } as unknown as MediaTrackConstraintSet] },
    { advanced: [{ focusMode: 'single-shot' } as unknown as MediaTrackConstraintSet] },
    { advanced: [{ exposureMode: 'continuous' } as unknown as MediaTrackConstraintSet] },
  ]
  for (const t of tests) {
    try {
      await track.applyConstraints(t)
      attempts.push({ tried: t.advanced, ok: true, settings: track.getSettings() })
    } catch (e) {
      attempts.push({ tried: t.advanced, ok: false, error: (e as Error).name })
    }
  }
  return { advertised: Object.keys(caps), attempts }
}

/** Simulate best-of-N: how much does taking the sharpest of N frames buy? */
async function bestOfN(n = 5, gapMs = 300) {
  const scores: number[] = []
  for (let i = 0; i < n; i++) {
    scores.push(score(video, video.videoWidth, video.videoHeight).p90)
    if (i < n - 1) await new Promise((r) => setTimeout(r, gapMs))
  }
  return { scores, best: Math.max(...scores), first: scores[0], gain: Math.max(...scores) / Math.max(1, scores[0]!) }
}

/** Score the live preview right now, over the production crop. */
function scoreNow(): number {
  if (!video.videoWidth) return 0
  return score(video, video.videoWidth, video.videoHeight).p90
}

/**
 * Cold-start profile: close the camera, reopen it, and sample from the first
 * frame onward. This is the sequence the kiosk actually performs before every
 * capture, so it is the one that decides whether a capture is sharp.
 */
async function coldStart({ seconds = 12, hz = 5, settle = 1500 } = {}) {
  close()
  await new Promise((r) => setTimeout(r, settle))
  const t0 = performance.now()
  await open()
  const samples: { t: number; p90: number }[] = []
  while (performance.now() - t0 < seconds * 1000) {
    samples.push({ t: Math.round(performance.now() - t0), p90: scoreNow() })
    readout.textContent = `coldStart ${samples[samples.length - 1]!.t}ms  ${samples[samples.length - 1]!.p90}`
    await new Promise((r) => setTimeout(r, 1000 / hz))
  }
  const peak = Math.max(...samples.map((s) => s.p90))
  // Time to reach 90% of the eventual peak — the number a settle delay has to
  // be longer than.
  const t90 = samples.find((s) => s.p90 >= 0.9 * peak)?.t ?? null
  const summary = { first: samples[0]?.p90, peak, t90, at1s: samples.find((s) => s.t >= 1000)?.p90, at3s: samples.find((s) => s.t >= 3000)?.p90 }
  log('coldStart', summary)
  return { summary, samples }
}

/**
 * Candidate settle detector: wait until the focus score stops moving.
 *
 * The autofocus sweep swings the score by 10x or more, so a plateau is a
 * reliable "the lens has stopped" signal without needing to know the absolute
 * score a given page should reach — which varies with how much ink is on it.
 */
async function awaitFocus({ hz = 5, window = 6, tol = 0.15, minMs = 600, timeoutMs = 9000 } = {}) {
  const t0 = performance.now()
  const recent: number[] = []
  const all: { t: number; p90: number }[] = []
  for (;;) {
    const t = Math.round(performance.now() - t0)
    const p90 = scoreNow()
    all.push({ t, p90 })
    recent.push(p90)
    if (recent.length > window) recent.shift()

    const hi = Math.max(...recent)
    const lo = Math.min(...recent)
    const stable = recent.length === window && hi > 0 && (hi - lo) / hi <= tol
    if (stable && t >= minMs) return { locked: true, t, score: p90, all }
    if (t >= timeoutMs) return { locked: false, t, score: p90, all }
    await new Promise((r) => setTimeout(r, 1000 / hz))
  }
}

/** Cold start, then settle-gate — the sequence the fixed kiosk will run. */
async function coldStartGated(opts = {}) {
  close()
  await new Promise((r) => setTimeout(r, 1500))
  await open()
  const gate = await awaitFocus(opts)
  // What the score does after the gate fires, to check it did not fire early.
  const after: number[] = []
  for (let i = 0; i < 15; i++) {
    after.push(scoreNow())
    await new Promise((r) => setTimeout(r, 300))
  }
  const eventual = Math.max(...after)
  return {
    lockedAtMs: gate.t,
    scoreAtLock: gate.score,
    locked: gate.locked,
    eventualPeak: eventual,
    ratio: Math.round((gate.score / eventual) * 100) / 100,
    trace: gate.all.map((s) => `${s.t}:${s.p90}`).join(' '),
  }
}

const lab = {
  devices, open, close, probeResolutions, watch, stopWatch, series, photoBurst,
  tryFocusControls, bestOfN, region, scoreNow, coldStart, awaitFocus, coldStartGated,
  print: (v: unknown) => log(JSON.stringify(v)),
}
;(window as unknown as { lab: typeof lab }).lab = lab
log('lab ready — call lab.open()')

# ChromeOS Capture — Untested Follow-ups

> **Nothing in this document has been measured.** There is no Chromebox at hand
> as of 2026-08-06, so this is a list of things to verify and possible
> improvements to try *when there is one* — kept separate from
> [camera-focus.md](./camera-focus.md), which contains only measurements taken on
> the macOS station.
>
> Treat every claim here as a hypothesis. The lesson from BHCS-9 is that
> plausible camera reasoning is wrong about as often as it is right, and the
> only way to tell is to measure. `packages/kiosk/focus-lab.html` is the tool
> for it; point it at the production camera and re-run the same sequence.

## What the fix assumes, and why it should hold anywhere

The BHCS-9 fix deliberately avoids anything host-specific:

- Focus is gated on a **measured plateau**, not a tuned delay. A camera that settles in 1s and one that settles in 8s both work; only the wait differs.
- Resolution is chosen by **probing the device's own maximum** and verifying the delivered size, rather than by naming a size.
- `ImageCapture.takePhoto()` is gone, which removes the most driver-dependent surface in the pipeline. It was Chromium-only and was never verified on the Chromebox.

So the expected outcome on ChromeOS is that it simply works, more slowly or more
quickly. That expectation is the thing to test first.

## Verify first

1. **Run the lab end to end** — `lab.open()`, `lab.probeResolutions()`, `lab.coldStart()`, `lab.tryFocusControls()`. Record the native mode, the sweep shape, and the settle time.
2. **Confirm the native mode is reachable.** ChromeOS's camera stack (CrOS Camera Service / `cros-camera`) sits between Chrome and the device and does its own format negotiation. It may not expose the same 3840×3104 mode, and it may report `resizeMode` differently. The `full` check in `streamMode()` will flag a shortfall in the UI — make sure it is not flagging spuriously.
3. **Check the settle time against the gate's 10s timeout.** If ChromeOS's stack converges more slowly, captures will start firing on the timeout rather than on a lock. `crop_json.focus.gate.locked` records which happened, and the admin viewer shows it in red — so a handful of real captures will answer this without instrumentation.
4. **Re-check `FOCUS_WARN_BELOW = 400`.** It is calibrated against this camera on this host. A different sensor, lens, or lighting rig shifts the absolute scale even though the metric is size-normalised.
5. **Watch for the wedged-camera failure** described in camera-focus.md. If ChromeOS's camera service is more disciplined about device release than macOS's, it may not happen at all — which would locate the bug in the macOS side rather than in the camera.

## Possible ChromeOS-only improvements

None of these are needed to close BHCS-9. They are worth trying only if
measurement shows a real problem.

- **A camera with a physical AF/MF switch**, locked manually at desk distance. This beats every software approach: no sweep, no gate, no wait. It is the single highest-value hardware change available and is not ChromeOS-specific — it is listed here because the production hardware is not yet fixed.
- **Kiosk-mode camera permission via policy.** A managed Chromebox can grant camera access through `VideoCaptureAllowedUrls` so the station never shows a permission prompt. This is an operational nicety, not a focus fix, but it removes one way a session can dead-end.
- **`chrome://media-internals`** and `/run/camera` logs give far more detail about format negotiation than `getSettings()` does. Worth reading if the native mode turns out to be unreachable.
- **Frame rate.** The macOS station gets 15fps at full resolution. If ChromeOS negotiates something slower, the gate's 5Hz sampling will see duplicate frames, which inflates apparent stability and could let it lock early. If measured fps is below ~10, lower the gate's sampling rate to match rather than leaving it at 5Hz.

## Do not assume

- That `takePhoto()` behaves better on ChromeOS. It is not used any more; if anyone proposes bringing it back, the burden is a measurement showing it delivers pixels the preview does not.
- That the constraint behaviour is the same. On macOS, Chrome honours *any* `exact` size by crop-and-scaling. Whether the CrOS stack does the same is unknown, and the `full` check exists precisely because that kind of silent substitution is hard to notice.

# Camera Focus and Resolution — Measured Behaviour

> Bench measurements of the OKIOCAM S2 Pro on the macOS development station, taken 2026-08-06 while fixing BHCS-9 ("captures are unreliably out of focus"). Everything here was measured through `/focus-lab.html`; nothing is inherited from earlier sessions. Numbers from the production Chromebox are still missing — see [chromeos-capture.md](./chromeos-capture.md).

The lab page lives at `packages/kiosk/focus-lab.html` and is served by the Vite dev server only. It is the tool to re-run against any new camera or host before trusting either.

## The focus metric

Variance of the Laplacian over a 5×5 tile grid, resampled to a fixed 1000px
working width so scores compare across sources of different sizes. The headline
number is the **sharpest tile** — see "The focus number is the sharpest tile"
below for why a percentile was wrong.

Scored **over the crop that gets stored**, never the whole frame. Desk grain
outside the page is high-frequency texture that a whole-frame measurement counts
as sharpness: one stored capture measured 1767 full-frame and 260 over its own
crop. The full-frame number was the one being recorded, and it was flattering
exactly the captures that were failing.

Calibrated against real stored captures from this station, sharpest tile over
the crop that was actually saved:

| capture | sharpest | p90 | verdict on inspection |
| -- | -- | -- | -- |
| 04-58-03 | 3953 | 3070 | crisp — dense Chinese worksheet, fully legible |
| 03-10-50 | 2041 | 1679 | sharp |
| 01-49-29 | 1549 | 892 | acceptable |
| live sparse pencil | 434 | 101 | sharp — one line of pencil on a blank page |
| 03-17-03 | 239 | 203 | visibly soft — *the same drawing as 03-10-50* |
| 03-19-25 | 203 | 102 | badly blurred |

`FOCUS_WARN_BELOW = 320` is the geometric midpoint of the 239–434 gap. Note the
p90 column has no such gap at all — 101 sharp against 102 blurred.

## Autofocus is a cold-start problem, not a drift problem

Once settled, focus is remarkably stable: sampled at 4Hz for 30s on an untouched
page, the score moved only 1358 → 1491, a 1.1× spread, drifting slowly upward
(exposure settling, not focus).

The instability is entirely in the seconds after a stream starts. Three
consecutive cold starts produced near-identical traces:

| t after stream start | score |
| -- | -- |
| 1.1–1.4s | ~80 (first frames, nothing yet) |
| 1.6–1.8s | **~1626** — sharp, lens still parked from the last session |
| 2.1–3.2s | 270–465, falling |
| 3.4–4.1s | **111–199** — bottom of the rack |
| 4.3–4.8s | 380 → 995, climbing |
| 5.0s+ | ~1670, stable indefinitely |

The camera runs a full autofocus sweep on every stream start and takes **5–6s**
to converge. The early sharp window is the trap: the preview looks perfect at
roughly the moment a student would reach for the capture button, and then the
lens racks away.

This is what made captures look random. The kiosk called `stopCamera()` after
every shot and reopened the stream for the next one, so **every capture was
taken somewhere in a fresh sweep** — and where in the sweep decided whether the
image was sharp. Same page, same position, minutes apart, wildly different
results, with no spatial gradient in the tile map to blame it on.

### What fixes it

1. **Keep the stream alive** across captures. This removes the sweep entirely for every capture after the first.
2. **Gate the shutter on a measured plateau** rather than a fixed delay. Six samples at 5Hz within 15% of each other. Costs ~1.2s on a warm stream, ~6.5s on a cold one, needs no assumption about how much ink is on the page, and self-adjusts to any camera.
3. **Best-of-4 burst** at 150ms spacing, scored on the cropped output, keeping the sharpest. ~25ms per candidate because only the winner is JPEG-encoded.

Measured after the fix, same scene:

| path | result |
| -- | -- |
| cold start ×3 | locked at 6.4–6.6s, scores 1610 / 1611 / 1649 — **0.98–1.01× the settled truth** |
| warm stream ×5 | locked at ~1.2s, total ~1.8s per capture, scores 1673–1694 (**1.3% spread**) |

## `takePhoto()` is worse than the preview, not better

`ImageCapture.takePhoto()` was being consulted on the belief that it read the
sensor at a higher resolution than the preview offered. It does not:

- `getPhotoCapabilities()` reports `imageWidth` min = max = 3840 and `imageHeight` min = max = 3104 — **exactly what the preview already delivers**.
- It costs **~3.2s per call**.
- It reconfigures the camera and restarts the autofocus sweep. A settled preview measured **1684 before a `takePhoto()` and 119 immediately after**, taking ~2s to recover.

No extra pixels, seconds of latency, and it destroys the focus we just waited
for. It has been removed. The earlier reading that "`takePhoto` gives 3840×3104
where the preview gives 640×480" was true only because the preview was being
opened with a broken constraint at the time — see below.

## Resolution: only the delivered numbers can be trusted

The device advertises `width.max` 3840, `height.max` 3104 (~1.24:1) at 15fps.

**Chrome satisfies any size you ask for, `exact` included.** Requesting an
`exact` 2560×1440 or 3840×2160 succeeds and reports back the size you asked for,
while quietly crop-and-scaling the one real sensor mode to fit. A constraint
that succeeds is therefore no evidence of native resolution at all.

`resizeMode` distinguishes them — under normal operation exactly one size,
3840×3104, comes back as `none`, and every synthesised size reads
`crop-and-scale`.

**But `resizeMode` is not sufficient either.** During this session the camera
wedged itself in a 640×480 mode and reported `resizeMode: 'none'` for it, while
`getCapabilities()` went on advertising 3840×3104. Both of the obvious "am I at
full resolution?" signals said yes and both were wrong.

So the only trustworthy check is **delivered size against advertised maximum**,
which is what `streamMode().full` does, and what the capture UI now warns on.

### The wedged-camera failure mode

After repeated rapid open/close cycling, the OKIOCAM stopped offering anything
above 640×480:

- `getUserMedia` with `exact` 3840×3104 → `OverconstrainedError`, every attempt, indefinitely.
- Plain `getUserMedia` → 640×480 @30fps, `resizeMode: 'none'`.
- `getCapabilities()` → still `3840×3104`.
- The device's `groupId` had changed, i.e. it re-enumerated on the USB bus.
- `ffmpeg -f avfoundation` listed **no supported modes at all** — so the hang is below the browser, in the device or its driver, not in Chrome.
- USB link speed was unchanged at 480 Mb/s, and it does not recover on its own.

Only a physical replug clears it. This is almost certainly a second, independent
contributor to "unreliable captures": a station in this state silently produces
640×480 crops that look fine on a scaled preview and are unreadable to OCR.
Hence the explicit reduced-resolution banner rather than a console warning.

## Focus cannot be driven in software

Verified by attempting it, not by reading a table. Chrome's
`getSupportedConstraints()` lists all 18 image controls — `focusMode`,
`focusDistance`, `exposureMode`, `torch`, `zoom`, `pointsOfInterest` and the
rest. The OKIOCAM advertises **none** of them: its `getCapabilities()` returns
only `aspectRatio`, `deviceId`, `facingMode`, `frameRate`, `groupId`, `height`,
`resizeMode`, `width`.

`applyConstraints` with `focusMode: continuous`, `focusMode: manual` +
`focusDistance`, `focusMode: single-shot`, and `exposureMode: continuous` each
fail with `OverconstrainedError`.

Autofocus can only be waited out and sampled around, which is what the gate and
the burst do. A camera with a physical AF/MF switch, locked manually at desk
distance, would beat anything achievable in software here — worth checking on
the production hardware.

## Still open

- **A high-contrast fiducial inside the crop region** would give contrast-detect autofocus something to lock onto on a near-blank page. The Gradescope-style fixed template needs one anyway. Not needed to close BHCS-9, but it is the next lever if faint-pencil pages prove marginal.
- **Whether the wedge is triggered by our open/close pattern** or is spontaneous. Now that the stream stays alive, the cycling that preceded it is much rarer — which may mask the problem rather than fix it.

## Cropping: find the page, do not assume it

Superseded the fixed centred rectangle. The old rationale in `paper.ts` held
that edge detection could not work here because "a light wooden desk under the
LED measures nearly as bright as paper". On an evenly lit frame that is false —
the luminance histogram is cleanly bimodal, desk 80–135 and paper 208–255 with
an empty valley between.

**But the station is not evenly lit, and brightness alone is genuinely not
enough.** With one half of a sheet in shadow, a single row measured 241–253
where the light falls, 127–203 where it does not, and a desk at 125–135: the
shadowed half of the page is *darker than the lit desk*. No luminance threshold
separates those, and the first version of this sliced pages in half along the
shadow line.

Colour does separate them, because the desk is wood and the paper is not. On
that same row, R−B was **+63** on desk, **−8** on lit page, **−23** on shadowed
page. Shadow changes how much light a surface returns; it does not make oak stop
being orange. So the threshold runs on `luminance − 2·(R−B)`, which scores desk
~2–10 and paper ~170–255 — a far wider gap than brightness ever gave. On a
neutral grey desk R−B is ~0 for both and it degrades to the plain luminance
test, which is correct rather than a failure.

Otsu still picks the split, so no contour library and no OpenCV are needed.

`detectPage` thresholds a 480px copy, takes the largest connected bright
component, and reads the four corners off the extremes of x+y and x−y. Checked
against a real page: corner angles 92/90/89/89, and a measured aspect of 1.287
against letter's true 1.294 — an independent confirmation that the corners land
on the paper.

The page is then warped to a flat upright rectangle rather than merely cropped.
There is real perspective to remove: opposite sides differ by 2.8% and the
diagonal midpoints sit 43px apart on a ~2900px page, so correcting rotation
alone would leave ~40px of error at the far corner.

Portrait versus landscape is measured from the quad, not declared. `pageUp` says
which edge is the top; it cannot distinguish a portrait page turned sideways
from a landscape page the right way up, and students do both.

Detection failing is not an error — the capture falls back to the fixed
rectangle and records why in `crop_json.detect`, because refusing a child's work
over a crop is worse than a loose one.

### Two performance traps, both worth remembering

**Clipped `drawImage` resamples the whole source.** The warp covers the output
in a 10x10 grid of affine cells; drawing those 200 triangles directly from a
3840x3104 frame measured **9397ms**. Copying the page's bounding box into an
intermediate canvas at roughly output size first — one `drawImage` — brings the
identical warp to **52ms**.

**Assigning `canvas.width` reallocates even when the value is unchanged**, and
the browser defers that cost past the end of the call. With the focus gate
scoring several times a second, that turned a 200ms timer into 950ms and a warm
capture into 8s. Guarding the assignment, and reusing the scoring canvases,
gives it back.

## The focus number is the sharpest tile, not a percentile

A percentile measures blank paper on a part-done worksheet. A genuinely sharp
page carrying one line of pencil scored p90 **101**, against **102** and **203**
for two visibly blurred captures — no threshold separates those, and the gate
could not lock either, because tiles jittering between 25 and 45 never fall
inside its tolerance. It timed out at 10.7s on a perfectly readable page.

By sharpest tile the same three are **434 / 203 / 239**, which separates
cleanly, and the value is steady because it tracks content rather than paper.
`FOCUS_WARN_BELOW` is 320, the geometric midpoint of that gap. The margin is
narrower than one would like — a further reason this warns rather than blocks.

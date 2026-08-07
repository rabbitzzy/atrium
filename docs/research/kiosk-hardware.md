# Kiosk Hardware — Research and Decisions

> Part of the hardware research for Atrium. Context: US-based Chinese school program (Bright Horizon Chinese School), shared kiosk station, no student-owned devices.

## What the kiosk hardware stack needs to do

1. **Identify the student** — read a QR badge or PIN at check-in
2. **Display the session UI** — React kiosk app served from Vercel
3. **Capture completed worksheets** — scan paper → image → LLM evaluation pipeline
4. **Print worksheets** — spend a Leaf, receive next Card
5. **Voice I/O** — deferred; not a v1 requirement

The scan step drove most of the hardware research because it is the most hardware-sensitive part of the flywheel.

---

## Scanning options evaluated

### Overhead document camera (Deli / CZUR)

Deli is the dominant budget brand in China. CZUR (ET16 Plus, Shine Ultra) is the Chinese brand most available in the US via Amazon. Both are "高拍仪" form factor — camera on an arm, pointed down at a flat surface.

**Why it was considered:** physically simple — student places paper on desk and taps a button.

**Why it does not fit:**
- Single-purpose peripheral: solves only the scan step, adds a device without consolidating anything.
- CZUR's "auto-flatten" algorithm solves book-spine distortion — a problem we will never have with flat worksheets.
- Deli is a commodity China-market brand with Windows/Chinese-first software, no US distribution or support.
- Neither handles student check-in, voice, or display — so you still need a full compute stack alongside it.

**Verdict:** Do not use. The category is correct (overhead capture) but the specific product choice should be driven by the US classroom context.

### iPad as all-in-one

iPad can handle compute + camera in one device, runs the Vercel web app in Safari/Chrome, and uses VisionKit's document scanner (best-in-class edge detection, perspective correction, deskew).

**Why it was considered:** eliminates separate compute hardware; Apple School Manager + MDM provides managed kiosk mode.

**Why it does not fit as the primary display:**
- iPad screen is 11" — too small for a shared station where students stand or sit at a desk.
- Adding an HDMI external monitor means two displays (awkward) and an adapter that can be unplugged.
- MDM infrastructure (Jamf School, Mosyle) is real overhead for a small pilot.
- Native app deployment requires App Store or TestFlight — the Vercel-hosted web app route is simpler to iterate on.

**Where iPad still makes sense:** as a dedicated scan terminal only, mounted on an arm above the desk, with the main kiosk UI on a separate monitor. Not the primary compute device.

**Verdict:** Over-engineered for v1. Revisit if the pilot scales to multiple sites and MDM investment is justified.

### IPEVO V4K Pro (USB document camera)

IPEVO is the standard document camera brand in US K-12 classrooms. The V4K Pro (~$170, Amazon US) is 8MP, USB, plug-and-play as a webcam in any browser via `getUserMedia()`. No drivers needed.

**Why it fits:**
- Recognized by US school IT departments — zero novelty friction.
- USB webcam = the browser treats it identically to any other camera. The kiosk app's scan UI works without any native code.
- Elmo (TT-12, MX-P2) is the premium alternative (~$300-400); same USB webcam interface, more durable, more commonly found in US school AV closets.
- No special paper, no proprietary software, no China-market supply chain dependency.

**The catch:** IPEVO is a peripheral. It requires a host computer.

**V4K vs V4K Pro — buy the Pro, and do not confuse the two.** They are separate products and Amazon listings for the plain V4K look nearly identical. Both are 8MP UVC cameras, so both work identically with `getUserMedia()`. The difference that matters to us: **the plain V4K has no light source; the V4K Pro has a built-in LED aimed at the same spot as the lens.** Since ambient light variation is our #1 OCR risk (see design constraints below), the plain V4K reintroduces the exact problem the Pro solves in the box, and you would end up bolting a desk lamp to the station to compensate. The Pro also adds a noise-cancelling mic, which is dead weight in v1 but relevant if voice returns in Phase 3. The plain V4K is fine as a cheap **prototype** unit on a desk with decent room light.

**Verdict:** Correct choice for the scan peripheral. Pair with a host compute device (see below). Buy the **Pro**, not the base V4K, for anything that goes in a classroom.

### OKIOCAM S2 Pro (USB document camera)

Okiolabs is a smaller US-market classroom camera brand. The S2 Pro is 13MP (Sony CMOS, max 3840×3104), UVC-compliant plug-and-play on Windows / Mac / Chrome OS, with a built-in LED light and mic, on a one-piece glass-fiber body with a metal weighted base.

**Why it fits — and where it beats the IPEVO:**
- **Capture area is 13.6 × 11 in.** This is the strongest technical argument for it and the easiest spec to overlook. Our fixed-template design needs the *whole* letter page in frame — QR header plus all three fiducial corner marks, with margin. A camera that only just covers 8.5 × 11 will clip a corner mark whenever a student sets the paper down slightly off-center, and template registration fails. The extra margin is real insurance against our most annoying classroom failure mode.
- Built-in light closes the same gap the V4K Pro does.
- UVC-compliant, so the browser scan UI needs no special integration — same as IPEVO.

**What to ignore on the spec sheet:**
- **13MP vs 8MP is not a reason to choose it.** 8MP already yields ~290 DPI across a letter page, far beyond what QR decoding and K-5 handwriting need. More pixels over USB 2.0 can make still capture *slower*, working against the sub-30s target.
- OKIOPoint smart pointer and 180° articulation are live-teaching-demo features. The extra joints are a mild negative — more ways for the camera to drift out of template alignment when a student bumps it.

**The tradeoff:** it loses IPEVO's institutional familiarity. That criterion was over-weighted for our situation — this is a single-site satellite kiosk where we are the IT department, not a district AV purchase going through school procurement. At this price point the repair story for either brand is "buy another one," not "file a ticket."

**Note on sourcing:** Okiolabs hosts its own OKIOCAM-vs-IPEVO comparison page. That is vendor marketing against a competitor, not independent testing — discount it accordingly.

**Verdict:** Acceptable alternative to the V4K Pro, and mildly preferred on capture area. Either is a defensible buy.

---

## Compute device decision

| Option | Notes |
|---|---|
| Laptop (MacBook, any Windows laptop) | Fine for prototype; not suitable for a fixed kiosk — hinge wears out, lid can be closed |
| Mac Mini | Solid, macOS, ~$600. Good if the team is Mac-native. No built-in display. |
| Intel NUC / Beelink mini PC | Windows or Linux, ~$150–300. Works but no institutional support. |
| **Chromebox (ASUS, HP)** | Fanless, Chrome OS, ~$200–250. Native Kiosk Mode. Best fit — see below. |
| Chromebook | Has a built-in camera (front-facing, not useful for document capture) but adds a hinge/lid that can be closed or broken. Desktop form factor (Chromebox) is better for a fixed station. |

### Why Chromebox wins for production

Chrome OS has a first-class **Kiosk App Mode**: the device boots directly into a single URL (the Vercel kiosk app), with no browser chrome, no address bar, no way for a student to navigate away. This is not a third-party lock-down tool — it is a built-in OS feature used widely in US schools, libraries, and self-service terminals.

Google Workspace for Education is already deployed in most US school districts. Enrolling a Chromebox into a Google Admin kiosk policy is a one-hour IT task. No MDM subscription needed.

IPEVO connects via USB and Chrome OS exposes it as a standard webcam. The Vercel app calls `getUserMedia({ video: { deviceId: ipevoDeviceId } })` — no special integration.

---

## Recommended hardware stack

### Prototype (dev / classroom trial)

| Component | Choice | Notes |
|---|---|---|
| Compute | Any existing Mac or Windows laptop | Kiosk mode: browser fullscreen (F11), tab locked |
| Camera / scanner | iPhone or existing webcam | For dev iteration — OCR accuracy test |
| Scan upgrade | IPEVO V4K (base model OK here) or OKIOCAM S2 Pro | Add when testing the actual scan-to-LLM pipeline. The light-less base V4K is acceptable at a desk with good room light |
| Display | Laptop screen | Fine for 1-on-1 testing |

### Production kiosk (classroom deployment)

| Component | Choice | Approx. cost |
|---|---|---|
| Compute | ASUS Chromebox 4 or HP Chromebox G3 | ~$220 |
| Display | 24" 1080p monitor (Dell, LG, HP — any) | ~$130 |
| Camera / scanner | OKIOCAM S2 Pro or IPEVO V4K **Pro** (or Elmo TT-12 for durability) — must have a built-in light | ~$170–350 |
| Mount / enclosure | Desk anchor for the camera + cable management | ~$30 |
| **Total** | | **~$550–730 per station** |

Printer is existing school hardware — shared on the network, one per room.

---

## Key design constraints this hardware imposes

- **Consistent lighting matters — buy a camera with its own light.** Room ambient light variation is the #1 cause of degraded OCR quality. The IPEVO **V4K Pro** and the OKIOCAM S2 Pro both have a built-in LED aimed at the capture surface; keep it on. The base IPEVO **V4K has no light at all** — do not buy it for a classroom station on the assumption that it does. If the kiosk sits near a window with strong daylight variation, add a privacy shroud over the scan surface regardless.
- **The camera must frame the full letter page with margin.** Template registration depends on the QR header *and* all three fiducial corner marks being visible in one frame. A capture area that only just covers 8.5 × 11 in will clip a corner the moment a student sets the paper down off-center. Verify the stated capture area before buying — this spec is easy to skip and it is the one that produces confusing intermittent scan failures in the classroom.
- **Fixed mount is non-negotiable for production.** A camera that students can knock around will drift out of alignment with the fixed-template coordinates. Note that both the IPEVO and OKIOCAM ship with a **weighted base, not a clamp** — weighted is not fixed. Production needs the unit anchored to the desk, or a ceiling/wall mount.
- **The fixed-template approach (Gradescope-style) tolerates a lot of camera variation.** As long as the QR code is readable and the three fiducial corner marks are visible, the software can re-register the template. Hardware does not need to be millimeter-precise.
- **Chrome OS kiosk mode does not allow USB device access by default.** The camera must be allowlisted by USB vendor ID in the Google Admin policy, whichever brand you buy. This is one config line in the Admin console, but it must be done.

---

## What was ruled out

| Option | Why ruled out |
|---|---|
| Flatbed scanner (Epson, Canon) | Students must feed paper through a slot — elementary kids jam it; no overhead view means no QR-first capture |
| ADF scanner (Fujitsu ScanSnap) | Same feeding problem; designed for office workers, not shared kiosks |
| Dedicated overhead camera (Deli, CZUR) | China-market, Windows-first, single-purpose; adds a device without consolidating any kiosk function |
| iPad as primary compute+display | Screen too small for shared station; MDM overhead not justified for pilot scale |
| Special paper / digital pens | Every product in this category has failed (Anoto, Livescribe in K-5 context) — see paper-interaction.md |

---

## Open questions

1. **IPEVO vs Elmo for durability.** IPEVO V4K Pro is the budget call; Elmo TT-12 is what a school IT department will respect and be able to repair. If the pilot goes beyond 3 stations, buy one Elmo for comparison.
2. **OKIOCAM S2 Pro vs IPEVO V4K Pro — decide empirically, not on spec sheets.** Both are UVC, both have a built-in light, both cost about the same. OKIOCAM wins on capture area (13.6 × 11 in), IPEVO wins on brand familiarity with school IT. Neither advantage is decisive on paper. Resolve it by running the same set of ~20 real student worksheets through both and comparing template-registration failure rate and end-to-end scan latency. That test is worth doing once, early — the answer then holds for every station we buy after.
3. **How much does brand familiarity actually buy us?** The original IPEVO recommendation leaned on "US school IT recognizes it." For a single-site satellite kiosk where we are the IT department, that may be close to worthless. Revisit only if Atrium expands to sites whose own IT staff must support the hardware.

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

**Verdict:** Correct choice for the scan peripheral. Pair with a host compute device (see below).

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
| Scan upgrade | IPEVO V4K Pro | Add when testing the actual scan-to-LLM pipeline |
| Display | Laptop screen | Fine for 1-on-1 testing |

### Production kiosk (classroom deployment)

| Component | Choice | Approx. cost |
|---|---|---|
| Compute | ASUS Chromebox 4 or HP Chromebox G3 | ~$220 |
| Display | 24" 1080p monitor (Dell, LG, HP — any) | ~$130 |
| Camera / scanner | IPEVO V4K Pro (or Elmo TT-12 for durability) | ~$170–350 |
| Mount / enclosure | Desk arm for IPEVO + cable management | ~$30 |
| **Total** | | **~$550–730 per station** |

Printer is existing school hardware — shared on the network, one per room.

---

## Key design constraints this hardware imposes

- **Consistent lighting matters.** The IPEVO has a built-in LED ring light — keep it on. Room ambient light variation is the #1 cause of degraded OCR quality. If the kiosk is near a window with strong daylight variation, add a privacy shroud over the scan surface.
- **Fixed mount is non-negotiable for production.** A camera on a flexible arm that students can knock around will drift out of alignment with the fixed-template coordinates. Use the IPEVO's clamp mount bolted to the desk, or a ceiling/wall mount.
- **The fixed-template approach (Gradescope-style) tolerates a lot of camera variation.** As long as the QR code is readable and the three fiducial corner marks are visible, the software can re-register the template. Hardware does not need to be millimeter-precise.
- **Chrome OS kiosk mode does not allow USB device access by default.** The IPEVO must be allowlisted by USB vendor ID in the Google Admin policy. This is one config line in the Admin console, but it must be done.

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

# Kiosk Frontend — Implementation Plan

Package: `packages/kiosk`  
Tech: React 18, Vite, TypeScript, inline styles, DM Sans font  
Port: 5173

## Two modes

```
checkin ──(name autocomplete)──▶ capture
   ▲                                │
   └────(switch student / idle)─────┘
```

There is no "check out" any more (BHCS-18). Children never used it, and a
station left on the previous child's name files the next child's work under
them. The return path is now three things that all mean the same event — the
person on screen is not the person at the station:

- **The name is the button.** A chip in the header of every screen shows whose
  session this is and reads `Not <Name>? 换人`. One tap goes back to check-in.
- **A line above the shutter.** *Saving as <Name> — not you? 换人*, sitting
  between the page and the three capture buttons, because pressing one of those
  is the moment a capture acquires a `student_id`.
- **The station gives up on its own.** Four minutes untouched → a "Still here?
  还在吗" card with the student's name, a 45-second countdown, and both answers
  (*Yes, it's me* / *Someone else*). Unanswered, it returns to check-in.
  Thresholds and the state machine live in `src/lib/presence.ts`; scrolling and
  keys count as activity, so reading a long Debrief never ends a visit.

Nothing is lost by returning to check-in: captures and Debriefs are permanent
and reachable from My Work on the next check-in.

The chat landing page between them is gone, and so is the second scan UI it
led to. Both were stubs, and a stub the student has to click past is worse
than no screen at all. The sections below are the plan for what a Docent
conversation and a Leaf balance should do when they are real — not a
description of code that exists.

### 1. Check-in (`src/modes/CheckIn.tsx`)
**Current state:** name-list mock  
**Target:**
- Camera window reads QR badge → decode `student_id`
- POST to BHCS portal `/students/:id` to validate + fetch name
- Fallback: PIN input for students without badge

**Open question:** face ID was flagged as "creepy" in CLAUDE.md §Open questions #1. Do not implement.

### 2. Chat (`src/modes/Chat.tsx`)
**Current state:** local message list, no backend  
**Target:**
- On load: `GET /api/skill-graph/tasks/next/:studentId` → show the Docent's opening message with today's task
- **Leaf balance** displayed top-right: `🌿 N Leaves` — updates in real time after earn/spend events
- User messages → `POST /api/skill-graph/chat` (wraps Claude claude-sonnet-4-6 with student context)
- Docent responses include: hint, encouragement, or "I think you're ready — print your Card!"
- When a Card is ready: `POST /api/worksheet/generate` → trigger browser print dialog
  - If `leaf_balance < 1`, show zero-balance state instead of print button: *"You're out of Leaves. Turn in your Card to earn one!"* (Docent voice line + on-screen message)
  - If print succeeds, Docent says: *"Here comes your Card! You've got [N] Leaves left."*
- Voice input (Phase 3): capture mic → Whisper STT → append as user message. Output is not deferred — see read-aloud below.

### 3. Scan-submit (`src/modes/ScanSubmit.tsx`)
**Current state:** file input → stub fetch  
**Target:**
- Camera stream (via `getUserMedia`) with "Capture" button (or auto-detect paper edges)
- On capture: `POST /api/evaluator/submit` with `{ scan, studentId, taskId }`
- Loading state ≤ 30 seconds
- On success:
  - Show Debrief summary on screen (digital-first — always)
  - Docent says: *"Great work! You just earned a Leaf. Ready to print your next Card?"*
  - Leaf balance updates in the UI (`+1` animation)
  - Optional print button for Debrief: *"Print your Debrief (free)"* — 0 Leaves, explicit opt-in

## Component plan

```
App
├── modes/
│   ├── CheckIn      (badge QR scan, fallback name list)
│   ├── Chat         (message thread + Docent widget + Leaf balance)
│   └── ScanSubmit   (camera capture + debrief display + Leaf earn animation)
└── components/
    ├── DebriefCard  (quality tiers per question, summary)
    ├── RadarChart   (mastery visualization — recharts or d3)
    ├── QRScanner    (jsQR or zxing-js wrapper)
    └── LeafBalance  (🌿 N Leaves badge — shown in Chat and ScanSubmit headers)
```

## Styling conventions (match BHCS portal)
- Font: `DM Sans` via Google Fonts
- All styles: inline objects (`style={{ ... }}`), no CSS modules, no Tailwind
- Color palette: `#1a1a2e` (navy), `#f8f7f4` (warm white), `#f0ede8` (card background)
- Border radius: 12–16px on interactive elements

## Accessibility for elementary-aged users
- Minimum font size: 16px; action labels 18px+
- All buttons have explicit `aria-label` when icon-only
- Voice **input** toggle: Phase 3 (the mic is the part that is deferred, and the reason is privacy, not effort)
- Voice **output**: shipped (BHCS-15). Any result screen with an app-supplied
  `speech` script carries 🔊 buttons, one per language, rendered by
  `platform/ReadAloud.tsx` over `lib/speech.ts`. Three rules hold it together
  and are worth not relitigating casually:
  - **Never autoplay.** Audio in a shared room is public in a way a monitor is
    not. The press is the consent.
  - **Only the finished result is spoken**, never a stream — TTS needs whole
    sentences, and restarting audio mid-thought is worse than waiting.
  - **The app writes the script**, the platform picks the voice. Read-aloud is
    a second rendering of the result, not a reading of the DOM.

# Kiosk Frontend — Implementation Plan

Package: `packages/kiosk`  
Tech: React 18, Vite, TypeScript, inline styles, DM Sans font  
Port: 5173

## Three modes

```
checkin ──(QR scan / name select)──▶ chat ──(submit button)──▶ scan
   ▲                                    │                          │
   └────────────────(check out)─────────┘◀─────────(done)─────────┘
```

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
- Voice: capture mic → Whisper STT → append as user message → TTS Docent response

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
- Voice input toggle visible and labeled in both EN and ZH

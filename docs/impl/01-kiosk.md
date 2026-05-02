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
- User messages → `POST /api/skill-graph/chat` (wraps Claude claude-sonnet-4-6 with student context)
- Docent responses include: hint, encouragement, or "I think you're ready — print your Card!"
- When a Card is ready: `POST /api/worksheet/generate` → trigger browser print dialog
- Voice: capture mic → Whisper STT → append as user message → TTS Docent response

### 3. Scan-submit (`src/modes/ScanSubmit.tsx`)
**Current state:** file input → stub fetch  
**Target:**
- Camera stream (via `getUserMedia`) with "Capture" button (or auto-detect paper edges)
- On capture: `POST /api/evaluator/submit` with `{ scan, studentId, taskId }`
- Loading state ≤ 30 seconds
- On success: show Debrief summary on screen + trigger Debrief PDF print

## Component plan

```
App
├── modes/
│   ├── CheckIn      (badge QR scan, fallback name list)
│   ├── Chat         (message thread + Docent widget)
│   └── ScanSubmit   (camera capture + debrief display)
└── components/
    ├── DebriefCard  (quality tiers per question, summary)
    ├── RadarChart   (mastery visualization — recharts or d3)
    └── QRScanner    (jsQR or zxing-js wrapper)
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

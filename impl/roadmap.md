# Atrium — Implementation Roadmap

## North star
A student can walk up to the kiosk, scan their badge, receive a personalized worksheet, work on it, submit it, and get a printed Debrief — all within one 30-minute session — with no teacher intervention required.

## Phases

### Phase 0 — Local scaffold (this week)
Goal: repo + services boot; flywheel runs end-to-end in a dev environment with mock data.

- [x] Monorepo structure (`packages/kiosk`, `skill-graph`, `worksheet`, `evaluator`)
- [x] Seed skill tree schema + 30-KC pilot set
- [x] BKT core implementation
- [x] Kiosk React app skeleton (check-in / chat / scan modes)
- [ ] `pnpm install` succeeds; all services start with `pnpm dev`
- [ ] Evaluator returns a valid `EvaluationResult` for a test scan image
- [ ] Worksheet generator returns an HTML Card for one KC
- [ ] `GET /students/:id/radar` returns expected shape against Supabase
- [ ] **Eco:** `student_print_state` table and `print_events` table exist in schema migration

### Phase 1 — Vertical slice (weeks 1–2)
Goal: one real student can complete one real loop.

- [ ] QR badge check-in wired to BHCS portal student API
- [ ] `nextTask` traverses Blueprint and picks a frontier KC
- [ ] Worksheet generator: real PDF output via headless Chromium
- [ ] QR code in PDF header round-trips back on scan (task_id + student_id decoded)
- [ ] Evaluator: multimodal grading returns structured Debrief for a handwritten math sheet
- [ ] BKT state update persisted to `student_kc_state` after attempt
- [ ] Kiosk displays Debrief on screen (digital-first); Debrief printed only on explicit request
- [ ] **Eco:** `POST /worksheet/generate` checks Leaf balance; returns `402` if `leaf_balance < 1`
- [ ] **Eco:** Successful scan awards +1 Leaf; print deducts 1 Leaf; both logged to `print_events`
- [ ] **Eco:** Leaf balance visible in kiosk Chat mode UI; zero-balance state shows Docent message

### Phase 2 — Teacher dashboard (weeks 3–4)
Goal: a teacher can review all AI evaluations and override any.

- [ ] Review queue: list of pending session_tasks needing teacher sign-off
- [ ] One-click approve / override with note
- [ ] Per-student radar chart view
- [ ] Alert feed: flag students with ≥4 failed attempts on same KC
- [ ] Override log: "You've overridden the fractions rubric 5 times — want to update it?"
- [ ] **Eco:** Leaf grant button (with reason dropdown) on each student's profile
- [ ] **Eco:** Class Leaf summary: Leaves earned vs. Cards printed this week
- [ ] **Eco:** Submission-rate metric: Submitted Cards / Printed Cards per student

### Phase 2.5 — Exhibits (creative contributions)
Goal: students can scan creative work; parents see a Gallery; task generator uses interest themes.

- [ ] Migration `002_exhibits.sql` — `exhibits` + `student_interest_profiles` tables
- [ ] Evaluator: `POST /extract-exhibit` endpoint with Haiku extraction call
- [ ] Skill-graph: `POST /students/:id/exhibits`, `GET /students/:id/exhibits`, `GET /students/:id/interest-profile`
- [ ] Interest profile merge logic on every extraction result
- [ ] Worksheet generator: fetch interest profile, inject as soft hint into problem-generation prompt
- [ ] Kiosk: "Share a drawing" button on home screen → free-form scan flow (no Leaf, no blocking)
- [ ] Kiosk: assigned creative task submission routes to `/extract-exhibit`; earns Leaf
- [ ] BHCS portal: Gallery tab on student detail page (thumbnail + caption + theme chips)
- [ ] Teacher toggle: `visible_to_parent` per Exhibit

### Phase 3 — Polish + voice (weeks 5–6)
Goal: 6-week pilot ready.

- [ ] Voice chat: Whisper STT + TTS bilingual responses from the Docent
- [ ] Mic muted on idle (privacy)
- [ ] BHCS portal push: session reports surface in parent portal inbox
- [ ] Printed Debrief layout (PDF template)
- [ ] Teacher authoring surface: add a KC, seed example problems, approve question templates
- [ ] Performance: scan → Debrief ≤ 30 seconds
- [ ] **Eco:** Docent voice lines for Leaf earn/spend events (bilingual)
- [ ] **Eco:** Parent portal: Leaf count line in session report ("earned 1 Leaf · 7 total this semester")
- [ ] **Eco:** End-of-semester eco summary for parents (Cards printed, submission rate)

## Open decisions (resolve in Phase 0/1)

| # | Decision | Options | Default |
|---|----------|---------|---------|
| 1 | Student auth at kiosk | QR badge · Face ID · PIN | QR badge |
| 2 | Worksheet: one task/page vs many | One (easier scan) · Many (more efficient) | One |
| 3 | PDF renderer | Playwright · Puppeteer | Playwright |
| 4 | Review queue sync vs async | Sync (teacher signs off before student sees) · Async | Async with flag |
| 5 | Voice persona name | Docent · unnamed | Docent |

## Service ports

| Service | Default port |
|---------|-------------|
| kiosk (Vite) | 5173 |
| skill-graph | 3001 |
| worksheet | 3002 |
| evaluator | 3003 |

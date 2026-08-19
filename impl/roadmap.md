# Atrium — Implementation Roadmap

## North star
A student can walk up to the kiosk, scan their badge, receive a personalized worksheet, work on it, submit it, and get a printed Debrief — all within one 30-minute session — with no teacher intervention required.

## Phases

### Phase 0 — Local scaffold (this week)
Goal: repo + services boot; flywheel runs end-to-end in a dev environment with mock data.

- [x] Monorepo structure (`packages/kiosk`, `skill-graph`, `worksheet-print`, `print-agent`)
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

- [ ] Voice chat **input**: Whisper STT (the TTS half shipped early as BHCS-15 — see below)
- [ ] Mic muted on idle (privacy)
- [ ] BHCS portal push: session reports surface in parent portal inbox
- [ ] Printed Debrief layout (PDF template)
- [ ] Teacher authoring surface: add a KC, seed example problems, approve question templates
- [ ] Performance: scan → Debrief ≤ 30 seconds
- [ ] **Eco:** Docent voice lines for Leaf earn/spend events (bilingual)
- [ ] **Eco:** Parent portal: Leaf count line in session report ("earned 1 Leaf · 7 total this semester")
- [ ] **Eco:** End-of-semester eco summary for parents (Cards printed, submission rate)

## Backlog (found while building, not yet scheduled)

### P0 — Captures are unreliably out of focus

Resolution is solved (3840×3104 sensor → ~2000×2400 stored, cropped and
upright). Focus is not, and it is now the single thing gating usable OCR.
Deferred deliberately, not forgotten.

**What was measured** (2026-08-06, `~/work/atrium/test-images/worksheet`, same
page, same camera position, captures minutes apart):

| capture | chosen | photo score | preview score | stored p90 |
|---|---|---|---|---|
| 01-49-29 (earliest) | preview | — | — | 1841 |
| 03-10-50 | photo | **3819** | 365 | 2061 |
| 03-17-03 | preview | 187 | **1767** | 260 |
| 03-19-25 | photo | **93** | 81 | 161 |

**Clues, in rough order of usefulness:**

1. *The problem is temporal, not spatial.* A 4×4 tile map of each stored image
   shows sharp captures peaking in the centre where the page content is
   (03-10-50: 3456 / 2339 / 2061) and blurred ones **flat across the whole
   frame** (03-19-25: 54–84, no gradient). A tilted camera or shallow depth of
   field would show a gradient. A uniform collapse means the whole focus plane
   is wrong — and it changes between captures on a static scene.
2. *Both capture paths are affected.* `takePhoto` scored 3819 once and 93
   twenty minutes later; the preview scored 1767 and 81. So this is the
   camera's autofocus, not `ImageCapture`. The earlier "takePhoto is blurry"
   reading was one unlucky sample generalised too far.
3. *Autofocus almost certainly never settles.* White paper is a low-contrast
   subject for contrast-detect AF; a hand entering frame to place the page
   likely re-triggers a hunt that then has nothing to lock onto.
4. *We cannot drive it.* The OKIOCAM exposes no `focusMode`, `focusDistance`,
   `exposureMode`, or `torch` through Chrome — verified against
   `getSupportedConstraints()`. AF can only be waited out or sampled around.

**Approaches worth trying, cheapest first:**

- **Best-of-N burst.** Because the defect is temporal, grab 3–5 frames over
  ~1.5s and keep the sharpest. This exploits the instability directly and needs
  no hardware cooperation. Highest expected value.
- **Settle delay** after the scene stops changing before capturing, so the hunt
  triggered by a hand leaving frame has time to finish.
- **Give AF something to lock onto**: a high-contrast fiducial printed on the
  worksheet (which the Gradescope-style template needs anyway) sitting inside
  the crop region.
- **Check the hardware** for a physical AF/MF switch or focus button. A camera
  locked manually at the desk distance beats anything software can do here.

**Known measurement bug to fix alongside:** the capture-time focus score is
computed on the *whole uncropped frame*, but what gets stored and OCR'd is the
cropped page. Desk wood grain is high-frequency texture and can inflate the
score for an image whose page is soft — 03-17-03 recorded preview 1767 yet its
stored crop measures 260. Score the crop region, not the frame.

### Other

- [ ] **Worksheet pipeline has no "this isn't a worksheet" guard.** Handed a
      photo of a child's drawing, it graded five imaginary questions as
      `mastered` and wrote a warm summary about creativity. A student who
      photographs the wrong page therefore gets confident, wrong feedback —
      worse than an error, because nothing signals it is wrong. Fix: add a
      nullable `is_worksheet` (or a `not-a-worksheet` quality tier) to the
      response schema and give the kiosk a "this doesn't look like a worksheet
      — try again?" state. Reproduced 2026-08-05 against `gemini-2.5-flash`.
- [x] ~~Capture at full sensor resolution~~ — done, then partly walked back.
      `takePhoto()` does give 3840×3104 where the preview gives 640×480, but it
      does not wait for autofocus to converge and measured **~34× less sharp**
      (tiled Laplacian p90: 48 vs 1646). Resolution and sharpness are
      independent and optimising the first cost the second. The pipeline now
      scores both candidates and keeps the sharper one.
- [ ] **Focus is the real capture bottleneck, not resolution.** The OKIOCAM
      exposes no `focusMode` / `focusDistance` through Chrome, so AF cannot be
      driven or locked from the app — only waited out. Worth testing: a settle
      delay before `takePhoto()`, and whether the camera has a physical focus
      control. Reference scores on this station: crisp text ~12000, 2px
      gaussian blur ~50, good preview capture ~1650.
- [ ] **Verify `takePhoto()` on the production Chromebox.** It is Chromium-only
      and driver-dependent; the canvas fallback exists but silently costs ~6x
      linear resolution, and `crop_json.via` is the only signal that it fired.
      Worth an explicit check on Chrome OS before the pilot.

## Ideas (shaped, not scheduled)

### Stream the evaluation instead of blocking on it

Today the kiosk shows a spinner for the whole OCR call — 8–10s of dead screen
for a child who just pressed a button. The metadata that arrives is useful; the
wait is the problem, and a progress bar would only make the waiting explicit
rather than shorter.

Instead, let the Debrief appear as it is generated: text arriving progressively
is read as *the system working*, and a student who starts reading question 1
while question 4 is still arriving has effectively waited zero seconds. It also
turns latency into something we can spend rather than something we must
minimise — a slower, better model becomes affordable.

Mechanics: Gemini exposes `streamGenerateContent` (SSE). The wrinkle is that
the pipelines use `response_schema`, so what streams is *partial JSON*, not
clean prose. Options, in rough order of preference:

1. Stream with an incremental JSON parser and render each `questions[]` element
   as it closes. Keeps one call and the existing schema.
2. Two-phase: stream a short plain-text encouragement first, then the
   structured evaluation. Simplest to build, costs an extra call.
3. Keep the structured call as-is but stream *something honest* alongside it —
   the transcription of each answer as it is read. Reads as the system working
   through the page, which is also true.

Needs a streaming transport from the serverless function to the kiosk (SSE
works on Vercel). The `captures` row still gets the final structured object, so
nothing downstream changes.

### Chess: stop at low confidence and let the student unblock

A chess scoresheet has a property worksheets do not: **every move is checkable
against the rules**. `chess-karma`'s validator already exploits this — its
three-pass corrector uses board state to resolve `B` vs `b`, missing captures,
and dropped piece prefixes. What it cannot do is ask a human.

The idea: transcribe until confidence drops below a threshold, then stop and
ask. Show the confirmed moves on a real board, ask the student about the one
ambiguous move, and resume from there. Each answer re-anchors the board state,
which makes every *subsequent* move easier to disambiguate — so one confirmation
can rescue a long tail of moves, and the student is doing something genuinely
useful rather than watching a spinner. It is also good chess practice.

Design notes:

- **Do not re-invent the board.** `chessground` (lichess's own board, MIT) or
  `react-chessboard` (React wrapper, MIT) for rendering; `chess.js` (MIT) for
  legality and SAN parsing in the browser — it is the JS counterpart to the
  `python-chess` the validator already uses.
- **Where validation runs** is the real decision. Porting the three-pass
  corrector to `chess.js` duplicates working code; calling the Python validator
  as a service keeps one implementation but adds a deployment. Worth deciding
  before building either.
- **Confidence needs a source.** Gemini does not return per-field confidence,
  so it has to be derived: ask for it in the schema (self-reported, weak), or
  infer it — a move the validator can only place via its pass-3 fallback is by
  definition low confidence. The validator's existing `status` field
  (`ok` / `normalized` / `corrected` / `inferred` / `failed`) is already close
  to the signal we want.
- **Bound the interaction.** A scoresheet where every third move needs
  confirmation is worse than a plain transcription with a "check these" list.
  Cap the number of prompts, then fall back.
- [ ] **Preview resolution is unstable on macOS.** The same constraints
      negotiated 3840×3104, 3840×2160, and 640×480 across sessions with no code
      change; `min:` constraints throw `OverconstrainedError` while
      `getCapabilities()` still advertises the full sensor. `takePhoto()` masks
      this for captures, but the on-screen guide is drawn against whatever the
      preview gives, so a VGA preview makes the guide coarse. Suspect a UVC
      driver state issue — a replug appeared to clear it.

## Open decisions (resolve in Phase 0/1)

| # | Decision | Options | Default |
|---|----------|---------|---------|
| 1 | Student auth at kiosk | QR badge · Face ID · PIN | QR badge |
| 2 | Worksheet: one task/page vs many | One (easier scan) · Many (more efficient) | One |
| 3 | PDF renderer | Playwright · Puppeteer | Playwright |
| 4 | Review queue sync vs async | Sync (teacher signs off before student sees) · Async | **Decided: async, provisional until reviewed** (BHCS-42) |
| 5 | Voice persona name | Docent · unnamed | Docent |
| 6 | Read-aloud in a shared room | Headphones · low-volume near-field speaker | **Open — hardware.** Software side is settled: student-initiated only, never autoplay (BHCS-15) |
| 7 | TTS provider | Browser `speechSynthesis` · ElevenLabs / OpenAI TTS | Browser, for v1. No key, no cache, instant replay |
| 8 | Where the teacher dashboard lives | BHCS portal · Atrium · Atrium behind portal auth | **Decided: in Atrium, one deploy, entry point in the portal** (BHCS-42) |

## Service ports

| Service | Default port |
|---------|-------------|
| kiosk (Vite) | 5173 |
| skill-graph | 3001 |
| worksheet | 3002 |
| print-agent | 3003 |


## Decision 8 — the teacher dashboard lives in Atrium (BHCS-42, 2026-08-18)

One deploy: a route in the kiosk app, beside the `#admin` viewer that already
works this way. The *entry point* is a link in the BHCS portal's nav, so
teachers still have one door and are not asked to remember a second address.

**Why not the portal**, which is where teachers already log in. The review queue
has to show the scan beside the grade, and the scan is Atrium's — stored in
Drive or locally, served by `/api/capture-file`, indexed by a `captures` row the
portal has never heard of. Rendering that queue from another repository turns
every iteration into an image-serving and API-versioning problem, during exactly
the weeks when the queue's design is least settled. `CLAUDE.md`'s rule against
replicating portal surfaces is about the parent inbox, notifications and the
gradebook; a working view over Atrium's own audit trail is not one of those.

**One deploy rather than two** because the kiosk is already a Vercel app with
serverless functions and a hash-routed admin surface. A teacher view is a route,
not a deployment, and standing up a second one doubles the configuration to keep
correct for a pilot with a handful of staff.

⚠️ The consequence to design for: this puts a teacher surface in the bundle
that runs on a shared machine in a room full of children. `#admin` already has
that property and is gated by `ADMIN_TOKEN`. Portal-issued auth has to replace
that token before any real student data is behind it — a shared secret typed at
a kiosk is not an access control.

## Decision 4 — review is asynchronous, and grades are provisional (BHCS-42)

A student gets their Debrief immediately, marked as not yet reviewed; a teacher
revises later and the revision is what parents and the Blueprint keep.

Synchronous review — a teacher signing off before the child sees anything —
protects trust and destroys the product. The premise is a station a child uses
unsupervised, and a grade that waits for an adult who is not in the room is a
child standing at a printer with nothing to do. It also cannot degrade: with no
teacher on site, sync means no feedback at all.

Writing down *why* matters more than the choice, because this is the decision
that will be relitigated the first time a bad grade reaches a parent. When that
happens, the answer is not to add a sign-off gate. It is that async was chosen
knowing bad grades would happen, and three things bound the damage — all of
which landed after this decision was first framed:

- **A fabricated grade cannot reach a child.** BHCS-22 asks the model whether
  the page is a worksheet before it grades, and a page that fails is refused on
  screen, in speech, and in the record hook. The original argument for sync was
  largely this failure mode.
- **A bad grade cannot rewrite a child's history.** BHCS-29 bounds how far one
  Visit may push a Room down, so a misread page costs a fraction of a skill
  rather than a term of work, and BHCS-30 will not call anything mastered on
  fewer than three observations.
- **Every grade is already reversible with a trail.** The attempt ledger stores
  mastery before and after as applied, so an override can be reasoned about
  rather than guessed at (BHCS-44).

What async still needs, and what BHCS-43 should carry: the provisional marker
must be visible to parents too, not only to teachers. A parent who reads a
Debrief has no way to know whether a human has seen it, and finding out later
that nobody had is worse than being told up front.

# Atrium — Layered Architecture

How the packages are meant to be organized, what belongs in each layer, and the
contract that keeps them apart.

Read this before adding a package, a capture kind, or a route.

Steps 1–4 of BHCS-13 have landed: the split described below is the code, not a
plan, and steps 5 and 7 with it — `chess-rules`, BHCS-11's resolution step, and
BHCS-10's streamed worksheet evaluation. Step 6 (evaluator consolidation) is
the last one outstanding.

## The three layers

**Platform.** Everything true regardless of what is on the paper. Camera
acquisition, autofocus, crop geometry, the capture upload endpoint, storage
(Drive / local), the `captures` table, student check-in, mode routing, the
admin viewer, the Gemini transport. The platform knows it is holding *a*
capture. It must never know that chess exists.

> Test: if adding a fourth capture kind requires editing a platform file, the
> boundary is wrong.

**Apps.** One per thing-a-student-can-put-under-the-camera. An app owns its
whole vertical: what paper it prints on, its extraction schema and prompt, its
post-processing, its result UI, its interaction model. Apps depend on the
platform and on helpers. **Apps never depend on each other.**

> Test: an app should be deletable by removing one directory and one registry
> line.

**Helpers.** Pure logic, no I/O, no React, no network, no env vars. Chess move
validation, SAN parsing, rubric shapes, shared types. Helpers are the only
layer that is trivially unit-testable, so anything worth testing belongs here.

> Test: if it needs a mock to test, it is not a helper.

Below these sit the **backend services** — `skill-graph` (BKT, student state),
worksheet generation, and whatever evaluation service survives the
consolidation below. Those are deployables, not layers, and are addressed by
HTTP rather than imported.

## Where the code is

| On disk | What it is | Layer |
|---|---|---|
| `packages/kiosk` | Camera, focus, crop, check-in, mode routing, admin viewer, storage, db, Gemini transport, and the two app registries | Platform |
| `packages/app-worksheet` | Capture → grade → Debrief | App |
| `packages/app-chess` | Capture → transcribe verbatim | App |
| `packages/app-doodle` | Capture → store | App |
| `packages/schema` | Shared types and the capture app contract | Helper |
| `packages/worksheet-print` | Print/PDF service (Hono :3002, Puppeteer, QR) — *not* the worksheet app | Backend service |
| `packages/evaluator` | Python FastAPI worksheet grader | Backend service (duplicated, see below) |
| `packages/skill-graph` | BKT + student state (Hono) | Backend service |
| `packages/chess-rules` | Handwritten move text resolved against the board | Helper |

The dependency arrows all point one way: apps depend on `schema`, the platform
depends on both, and nothing depends on the platform. No app imports another.

Two files in `kiosk` name a capture kind, and they are the two that are meant
to: `src/platform/registry.ts` and `api/_lib/registry.ts`. Everything else —
`camera.ts`, `focus.ts`, `paper.ts`, `pipelines.ts`, `Capture.tsx`,
`Admin.tsx`, `api/_lib/{db,drive,storage,gemini,bhcs,admin}.ts`, `capture.ts`,
`captures.ts` — works off `CaptureApp` and never learns what is on the paper.

Still out of place, both scheduled: `packages/evaluator` grades worksheets a
second time in Python behind `ScanSubmit.tsx`, and the chess validator still
lives in a different repository (`~/src/chess-karma`).

## Why this happened when it did: two features were about to collide

This was not housekeeping. Two queued features both needed to change the same
two shared files, in incompatible directions:

- **BHCS-10** (stream the worksheet evaluation) replaces the buffered
  `visionJson` call with SSE — *for worksheets only*. Chess and doodles must
  keep the buffered path.
- **BHCS-11** (chess board, progressive move confirmation) adds a stateful
  human-in-the-loop resolution cycle — *for chess only*. Worksheets have no
  such step.

Both would have landed in `pipelines.ts` and `Capture.tsx`. Built that way,
`runPipeline` becomes a three-way branch over three different transports, and
`ResultCard` grows an interactive board inside the component that also renders
doodles. Split first, and each feature is a change to one app directory.

## The seam: the capture app contract

Defined in `packages/schema/src/app.ts`, implemented by each app, consumed by
the platform's two registries. This is the whole design.

It is **two** interfaces rather than the one BHCS-13 sketched, because the
halves run on opposite sides of a wire that already exists: `extract` and
`refine` run in the serverless capture function, `ResultView` and `Resolve` run
in the browser. A single object would drag React into the capture lambda and
ship every extraction prompt down to the client bundle. So each app package has
two entry points, and `id` is the join:

```ts
@atrium/app-chess          → CaptureApp        { id, label, labelZh, icon,
                                                 blurb, paper, waitHint,
                                                 ResultView, StreamView?,
                                                 Resolve?, needsResolve?,
                                                 speech? }
@atrium/app-chess/server   → CaptureAppServer  { id, extract?, refine? }
```

Optionality carries all the variation. No `extract` **is** the store-only path.
`extract.stream` + `StreamView` **are** BHCS-10. `refine` **is** where
BHCS-12's validator runs. `Resolve` **is** BHCS-11's board. `speech` **is**
BHCS-15's read-aloud.

### `CaptureContext` — who the capture is for (BHCS-14)

`extract.systemPrompt` is `string | ((ctx: CaptureContext) => string)`, and
`CaptureContext` currently holds the checked-in `Student` and nothing else. The
platform assembles it, hands it over, and looks no further — which app consults
which student fact, and what it changes about the asking, is the app's business
in exactly the way the prompt's wording already was.

It is a function rather than a template because the variation is not a slot in a
sentence: BHCS-14's brief for a first-grader and its brief for a fifth-grader
differ in which instructions are present at all. `userPrompt` stays a constant —
it says what to do with *this image*, which is the same request whoever handed
the page over.

Two apps ignore the context entirely and keep their prompts as plain strings,
which is the conformance test for the field being optional in practice as well
as in the type.

This is where a reading-level estimate from `skill-graph` lands when there is
BKT history to compute one from. Nothing in the context may ever be depended on:
`student.grade` is null for most of the roster, and every field added after it
will be at least as sparse.

### `speech` — the result, out loud (BHCS-15)

An app returns `SpokenScript` — lines per language — and the platform's
`ReadAloud` decides voice, pace, and the fact that nothing is ever spoken
unless a student pressed a button. It is the same cut as `waitChat`: *what* is
said is the app's, because only it knows a quality tier from a transcript;
*how* it is said is true of anything this station says out loud, so it is the
platform's.

The seam matters more than it looks. Read-aloud is a **second rendering of the
result**, not a reading of the screen: `⭐ You got it 会了` is one pill to the
eye and three unrelated noises to a voice, and a synthesiser handed a mixed
`summary_en`/`summary_zh` page reads half of it in the wrong language. So the
app writes the spoken version deliberately, and no platform code scrapes the
DOM for text.

Nothing streams. Only a finished result is spoken, which resolves BHCS-15's
question about colliding with BHCS-10: the stream is for the eye, the audio is
for after.

The platform holds two registries and nothing else:

```ts
// packages/kiosk/src/platform/registry.ts   — the browser half
import { worksheetApp } from '@atrium/app-worksheet'
import { chessApp }     from '@atrium/app-chess'
import { doodleApp }    from '@atrium/app-doodle'

export const APPS = [worksheetApp, chessApp, doodleApp] as const
export const appById = (id: string) => APPS.find((a) => a.id === id)

// packages/kiosk/api/_lib/registry.ts       — the function half
import { worksheetServer } from '@atrium/app-worksheet/server'
// …
```

What collapsed as a result:

| Before | Now |
|---|---|
| `KINDS` array in `Capture.tsx` | `APPS.map(...)` |
| `CAPTURE_KINDS` in `pipelines.ts` | `APP_IDS` |
| `PAPER_FOR_KIND` in `paper.ts` | `app.paper` |
| ternary dispatch in `runPipeline` | `app.extract` → `app.refine` |
| `if (result.kind === 'worksheet')` in `ResultCard` | `<app.ResultView />` |
| `if (kind === 'doodle') return skipped` | absence of `extract` |
| `kind === 'doodle' ? … : …` spinner copy | `app.waitHint` |
| hardcoded `<option>`s in `Admin.tsx` | `APPS.map(...)` |

Adding an app is one directory and two registry lines, with zero platform
edits. Deleting one is the same in reverse.

## Layout

```
packages/
  kiosk/                  Platform. Camera, focus, crop, check-in, mode
                          routing, admin, storage, db, Gemini transport,
                          both app registries. No domain knowledge.

  app-worksheet/          Capture → grade → Debrief. Streamed by BHCS-10.
  app-chess/              Capture → transcribe → validate → resolve on a board.
  app-doodle/             Capture → store. Deliberately tiny; it is the proof
                          the contract does not force machinery on simple kinds.

  schema/                 Helper. Shared types and the capture app contract.
  chess-rules/            Helper. Port of chess-karma parser.py + validator.py
                          onto chess.js, plus the resolution loop BHCS-11 asks
                          with. Pure, unit-tested against the Python.

  skill-graph/            Service. BKT + student state.
  worksheet-print/        Service. Renamed from `worksheet` — it prints Cards,
                          it is not the worksheet app.
  evaluator/              Service. Python worksheet grader, to be deleted —
                          see below.
```

## Two decisions this forces

**1. There are two worksheet evaluators. Pick one.**

`packages/evaluator/src/grader.py` (Python, FastAPI, `GRADER_SYSTEM` prompt,
hardcoded `V0_TASK_RUBRIC`) and `packages/app-worksheet/src/server.ts`
(`WORKSHEET_PROMPT`, `WORKSHEET_SCHEMA`) grade the same artifact with two
prompts in two languages. `App.tsx` documents the split honestly:

> *Legacy single-purpose worksheet flow, kept while the Python evaluator is
> still the path of record for the Leaf-earning submission loop.*

So `ScanSubmit.tsx` (194 lines) and `Capture.tsx` were also two scan UIs. The
Leaf economy is wired to the Python path; the capture platform is wired to the
TypeScript path. Recommendation: **the TypeScript pipeline wins** — it is the
one with storage, the `captures` table, crop metadata, and the admin viewer
behind it, and folding Leaf-awarding into it is a smaller job than rebuilding
that in Python. Then `app-worksheet` owns the prompt and `evaluator` is deleted.

**Update:** the UI half of that is already settled. `ScanSubmit.tsx` reached
no route — nothing had set `mode: 'scan'` since `Capture` landed — so it was
deleted along with the stub `Chat.tsx` when check-in was pointed straight at
capture. The Python evaluator survives it, and is still the thing to fold in.

**2. Where chess validation runs — the layering answers BHCS-12's open question.**

BHCS-12 leaves "port to `chess.js`" vs "call the Python validator as a service"
open. Under this architecture it is no longer a coin flip: BHCS-11 needs the
*same* validation logic in the browser (to re-anchor board state as the student
confirms each ambiguous move) that BHCS-12 needs on the server. A helper
package runs in both. A Python service runs in neither without a network round
trip per confirmation. **Port to `chess.js` as `packages/chess-rules`.**

That is the layering paying for itself before the refactor is even finished.

## Rules for further development

1. **New capture kind → new app package.** Never a new branch in
   `pipelines.ts` or `ResultCard`.
2. **Platform files may not name a kind.** Only the two registries may say
   `worksheet`, `chess`, or `doodle`. Greppable, and currently true:

   ```
   grep -rn -iE 'worksheet|chess|doodle' packages/kiosk/src/lib packages/kiosk/api/_lib \
     | grep -v registry.ts
   ```

   (`bhcs.ts` mentions worksheets in prose about grade levels, and the legacy
   `ScanSubmit.tsx` flow is a whole worksheet UI; both go with step 6.)
3. **Apps do not import apps.** Shared logic between two apps is a helper, by
   definition.
4. **Helpers stay pure.** No `fetch`, no `process.env`, no React. The moment a
   helper needs either, it is an app concern or a service. `schema` imports
   React's `FC` type to describe `ResultView`, which is `import type` and erases
   at compile time — the package contributes nothing to any bundle, and the
   client build hashed identically the commit it was introduced.
5. **`captures.kind` is a database value.** App ids are stable strings; renaming
   one is a migration.
6. **The raw extraction is never overwritten.** `refine` produces a new object
   alongside `ocr_json`, never in place of it. The verbatim transcription is the
   audit trail a teacher needs, and the whole reason the chess prompt preserves
   what the child actually wrote.
7. **Every app must work without its optional parts.** No `refine`, no
   `Resolve`, no `extract` — the doodle app is the conformance test for this and
   should stay in the tree even if it never grows.

## Migration order

Each step compiles and ships on its own. No big-bang refactor.

1. ~~**Rename** `packages/worksheet` → `packages/worksheet-print`.~~ Done.
2. ~~**Extract `packages/schema`.**~~ Done — types only, so the client bundle
   came out byte-identical, which is the cleanest possible proof that a
   cross-package import works in this workspace.
3. ~~**Define the contract** and re-express the three kinds against it in
   place.~~ Done. The design changed under contact, as intended: one interface
   became two, split along the browser/function wire.
4. ~~**Move each app out.**~~ Done, in one commit rather than three — every
   moved file was byte-identical and the client bundle hash did not change, so
   three commits would have been ceremony rather than reviewability.
5. ~~**Build `packages/chess-rules`**~~ Done (BHCS-12). Reproduces the Python
   on 101 of 101 half-moves across both chess-karma fixtures, statuses
   included — which needed difflib's exact ratio *and* python-chess's
   move-generation order, because both decide what a garbled cell resolves to.
6. **Consolidate the evaluators**, delete `packages/evaluator`. (`ScanSubmit.tsx`
   is already gone — see the update under decision 1.)
7. ~~BHCS-11 and BHCS-10~~ Done, each inside one app directory. BHCS-11 was the
   proof the split paid off: the board, the prompt selection and the
   re-anchoring loop are entirely inside `app-chess` and `chess-rules`. The
   platform gained one optional contract field (`needsResolve`) and one route
   that stores a payload it does not read.

   BHCS-10 is the same shape. `app-worksheet` sets `extract.stream` and gains a
   `StreamView`; chess and doodle change in no way at all and keep the buffered
   transport, with no branch on kind anywhere. What the platform gained is
   genuinely app-agnostic and is what BHCS-17 will reuse for chess:

   | Platform | What it is |
   |---|---|
   | `api/_lib/partial-json.ts` | Reads a JSON document that is still being written. Only surfaces values that can no longer change, so nothing on screen is ever revised. |
   | `api/_lib/sse.ts` | Answering a request in instalments. |
   | `api/_lib/gemini.ts` | `visionJsonStream`, the same call and the same request body as `visionJson`, delivered as it is written. |
   | `src/lib/capture-stream.ts` | The kiosk end of the same wire. |

   The row is written identically either way: what is stored is parsed from the
   accumulated text with the strict parser, never from a repaired partial.

   **Where the wait actually goes, measured.** Streaming moves less of it than
   the ticket assumed, and the reason is worth knowing before BHCS-17 builds on
   it: `gemini-2.5-flash` thinks before it emits a single output token, and
   thinking does not stream. On one worksheet, time to first token tracked the
   thinking budget almost linearly — 1.8s at `thinkingBudget: 0`, 2.7s at 256,
   3.7s at 512, 4.5–9.7s on the default budget (579–1590 thought tokens). Once
   text starts, the ten questions land over about 1.5s.

   So on today's configuration streaming turns a ~10s blank screen into a ~7s
   blank screen followed by 3s of reading. Real, but the lever that moves this
   is the thinking budget, not the transport. That is a grading-quality
   decision (a 256-token budget graded the same sheet identically in the runs
   above, but three runs is not evidence) and it belongs with the P0's OCR
   questions rather than here.

Steps 1–4 were refactoring with no behavior change. Step 5 is the first real
capability. Steps 6–7 are the features that motivated the split.

### What steps 1–4 did not do

- ~~**`refine` has no column.**~~ Migration 003 added `refined_json`,
  `refined_status` and `refined_error` — generic, not chess-named, because the
  refine step belongs to the platform's pipeline. `ocr_json` is still never
  rewritten.
- **The Vercel build is unverified.** The dev server resolves the workspace
  packages through Vite, which is the path in daily use and is covered
  end-to-end. `@vercel/node` traces and compiles TypeScript from linked
  workspace packages too, but nothing here has been deployed, so the first
  deploy should be treated as the real test of that.

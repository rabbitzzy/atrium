# Atrium — Layered Architecture

How the packages are meant to be organized, what belongs in each layer, and the
contract that keeps them apart.

This document exists because the code no longer matches the intent. The intent
is right; the code drifted. Read this before adding a package, a capture kind,
or a route.

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

## Where the code actually is today

Four packages, and **not one of them depends on another** — there is no
`@atrium/*` entry in any `dependencies` block. That is the tell: this is not a
platform with apps on top, it is four parallel silos plus a monolith.

| On disk | What it actually is | Layer it belongs to |
|---|---|---|
| `packages/kiosk` | Platform **and** all three apps, fused | Platform + 3 apps |
| `packages/worksheet` | Print/PDF service (Hono :3002, Puppeteer, QR) — *not* the worksheet app | Backend service |
| `packages/evaluator` | Python FastAPI worksheet grader | Backend service (duplicated, see below) |
| `packages/skill-graph` | BKT + student state (Hono) | Backend service |
| — | *no chess package exists* | missing |
| — | *no helper package exists* | missing |

Three specific mismatches with the model you described:

1. **`packages/worksheet` is not the worksheet app.** It generates and prints
   Cards. The worksheet *app* — the extraction prompt, the grading schema, the
   result UI — lives in `kiosk`, and a second copy of the grading lives in
   `evaluator`.
2. **There is no chess package.** Chess is a `Kind` union member in
   `Capture.tsx:55`, a prompt in `pipelines.ts:104-125`, a `'halfLetter'` entry
   in `paper.ts:67`, and a validator in a *different repository*
   (`~/src/chess-karma`).
3. **There are no helpers.** Zero shared packages, zero cross-package imports.

### Where the app logic is currently fused into the platform

Three platform files carry per-kind knowledge:

- `src/modes/Capture.tsx` (643 lines) — the `Kind` union, the `KINDS` picker
  array, and `ResultCard`, which branches on `result.kind` to render worksheet
  quality tiers or a chess move table.
- `api/_lib/pipelines.ts` (164 lines) — `CAPTURE_KINDS`, both schemas, both
  prompts, and a ternary dispatch in `runPipeline`.
- `src/lib/paper.ts` (115 lines) — `PAPER_FOR_KIND`, already typed
  `Record<string, ...>` rather than `Record<Kind, ...>`, which is the file
  quietly admitting it does not want to own this.

Everything else in `kiosk` — `camera.ts`, `focus.ts`, the crop geometry in
`paper.ts`, `api/_lib/{db,drive,storage,gemini,bhcs,admin}.ts`, `capture.ts`,
`CheckIn.tsx` — is already clean platform code. **The platform layer is in
good shape.** The problem is narrow and fixable.

## Why now: two features are about to collide

This is not housekeeping. Two queued features both need to change the same two
shared files, in incompatible directions:

- **BHCS-10** (stream the worksheet evaluation) replaces the buffered
  `visionJson` call with SSE — *for worksheets only*. Chess and doodles must
  keep the buffered path.
- **BHCS-11** (chess board, progressive move confirmation) adds a stateful
  human-in-the-loop resolution cycle — *for chess only*. Worksheets have no
  such step.

Both land in `pipelines.ts` and `Capture.tsx`. Built as-is, `runPipeline`
becomes a three-way branch over three different transports, and `ResultCard`
grows an interactive board inside a component that also renders doodles. Split
first and each feature becomes a change to one app directory.

## The seam: the capture app contract

One interface, defined in the platform, implemented by each app. This is the
whole design.

```ts
// packages/kiosk/src/platform/app-contract.ts

export interface CaptureApp<Raw = unknown, Result = Raw> {
  /** Stored in captures.kind. Stable — it is in the database. */
  id: string

  /** Picker presentation. */
  label: string
  labelZh: string
  icon: string
  blurb: string

  /** Which paper this kind arrives on. Replaces PAPER_FOR_KIND. */
  paper: keyof typeof PAPER

  /**
   * Server-side extraction. Omit entirely for store-only kinds — that is what
   * makes the doodle app three fields long instead of a special case in
   * runPipeline.
   */
  extract?: {
    schema: GeminiSchema
    systemPrompt: string
    userPrompt: string
    /** Opt into SSE. The worksheet app sets this; nothing else changes. */
    stream?: boolean
  }

  /**
   * Pure post-processing over extracted output. This is where the chess
   * validator runs (BHCS-12): raw OCR in, validated SAN + per-move status out.
   * Runs server-side after extract, before the row is updated.
   */
  refine?(raw: Raw): Promise<Result>

  /** Result rendering. Replaces the branch in ResultCard. */
  ResultView: React.FC<{ result: Result; student: Student }>

  /**
   * Optional human-in-the-loop step between refine and done. The chess board
   * (BHCS-11) is this. Resolving to a Result means the platform's capture flow
   * does not need to know an interactive step happened.
   */
  Resolve?: React.FC<{ result: Result; onResolved: (r: Result) => void }>
}
```

The platform holds a registry and nothing else:

```ts
// packages/kiosk/src/platform/registry.ts
import { worksheetApp } from '@atrium/app-worksheet'
import { chessApp }     from '@atrium/app-chess'
import { doodleApp }    from '@atrium/app-doodle'

export const APPS = [worksheetApp, chessApp, doodleApp] as const
export const appById = (id: string) => APPS.find((a) => a.id === id)
```

What collapses as a result:

| Today | After |
|---|---|
| `KINDS` array in `Capture.tsx` | `APPS.map(...)` |
| `CAPTURE_KINDS` in `pipelines.ts` | `APPS.map(a => a.id)` |
| `PAPER_FOR_KIND` in `paper.ts` | `app.paper` |
| ternary dispatch in `runPipeline` | `appById(kind)` → `extract` → `refine` |
| `if (result.kind === 'worksheet')` in `ResultCard` | `<app.ResultView />` |
| `if (kind === 'doodle') return skipped` | absence of `extract` |

Adding an app becomes: one directory, one registry line, zero platform edits.

## Target layout

```
packages/
  kiosk/                  Platform. Camera, focus, crop, check-in, mode
                          routing, admin, storage, db, Gemini transport,
                          app registry + contract. No domain knowledge.

  app-worksheet/          Print → capture → grade → streamed Debrief (BHCS-10)
  app-chess/              Print → capture → validate → board resolution (BHCS-11)
  app-doodle/             Capture → store. Deliberately tiny; it is the proof
                          the contract does not force machinery on simple kinds.

  chess-rules/            Helper. Port of chess-karma parser.py + validator.py
                          onto chess.js. Pure, no I/O, unit-tested. (BHCS-12)
  schema/                 Helper. Shared types: Student, CaptureRow, quality
                          tiers, Debrief, move status.

  skill-graph/            Service. BKT + student state.
  worksheet-print/        Service. Renamed from `worksheet` — it prints Cards,
                          it is not the worksheet app.
```

`packages/worksheet` → `packages/worksheet-print` is a rename worth doing early
and cheaply: the current name is the single biggest source of confusion about
what this repo contains.

## Two decisions this forces

**1. There are two worksheet evaluators. Pick one.**

`packages/evaluator/src/grader.py` (Python, FastAPI, `GRADER_SYSTEM` prompt,
hardcoded `V0_TASK_RUBRIC`) and `kiosk/api/_lib/pipelines.ts`
(`WORKSHEET_PROMPT`, `WORKSHEET_SCHEMA`) grade the same artifact with two
prompts in two languages. `App.tsx:59-60` documents the split honestly:

> *Legacy single-purpose worksheet flow, kept while the Python evaluator is
> still the path of record for the Leaf-earning submission loop.*

So `ScanSubmit.tsx` (194 lines) and `Capture.tsx` are also two scan UIs. The
Leaf economy is wired to the Python path; the capture platform is wired to the
TypeScript path. Recommendation: **the TypeScript pipeline wins** — it is the
one with storage, the `captures` table, crop metadata, and the admin viewer
behind it, and folding Leaf-awarding into it is a smaller job than rebuilding
that in Python. Then `app-worksheet` owns the prompt, `evaluator` is deleted,
and `ScanSubmit.tsx` goes with it.

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
2. **Platform files may not name a kind.** `camera.ts`, `focus.ts`,
   `storage.ts`, `capture.ts`, `db.ts` must contain no occurrence of
   `worksheet`, `chess`, or `doodle`. This is greppable; treat it as a lint
   rule.
3. **Apps do not import apps.** Shared logic between two apps is a helper, by
   definition.
4. **Helpers stay pure.** No `fetch`, no `process.env`, no React. The moment a
   helper needs either, it is an app concern or a service.
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

1. **Rename** `packages/worksheet` → `packages/worksheet-print`. Naming only.
2. **Extract `packages/schema`** — the types already duplicated between
   `kiosk/api` and `kiosk/src`. Smallest possible proof that cross-package
   imports work in this workspace.
3. **Define the contract** in `kiosk/src/platform/`, and re-express the three
   existing kinds against it *in place*, still inside `kiosk`. No files move.
   This is where the design gets validated — if the contract cannot express
   what `Capture.tsx` already does, fix the contract now, cheaply.
4. **Move each app out**, one package per commit, doodle first (smallest),
   worksheet last (biggest).
5. **Build `packages/chess-rules`** — BHCS-12, now with an obvious home.
6. **Consolidate the evaluators**, delete `packages/evaluator` and
   `ScanSubmit.tsx`.
7. **Then** BHCS-11 and BHCS-10, each inside one app directory.

Steps 1–4 are refactoring with no behavior change and should be reviewable as
such. Step 5 is the first real capability. Steps 6–7 are the features that
motivated the split.

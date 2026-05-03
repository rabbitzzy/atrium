# Architecture Overview

> **Last updated:** 2026-05-03
> **Status:** Active — aligns to Phase 0 hardware decisions and tech-spec v1.
>
> Single source of truth for the full system topology: hardware through cloud. When any layer changes, update this first, then cascade to `/product/tech-spec.md` and `/impl/`.
>
> **Critical design constraints driving every decision here:**
> - No student-owned devices — kiosk is the only access point
> - Paper is a gated resource (Leaf economy) — print and scan paths are transaction boundaries
> - All AI evaluation is provisional — teacher review is a first-class concept, not an afterthought
> - PII lives only in the BHCS portal — Atrium stores only opaque `student_id`

---

## 1. Hardware Topology

```mermaid
graph TD
    subgraph Classroom["Classroom — School LAN"]
        subgraph Station["Kiosk Station"]
            IPEVO["IPEVO V4K Pro<br/>8MP · LED ring · fixed mount"]
            Chromebox["Chromebox ASUS/HP G3<br/>Chrome OS Kiosk Mode<br/>locked to URL"]
            Monitor["24″ Monitor<br/>student-facing"]
            IPEVO -->|USB| Chromebox
            Chromebox -->|HDMI| Monitor
        end
        Switch["School LAN Switch"]
        Printer["Shared Printer<br/>existing school hardware"]
        Station -->|"Ethernet / Wi-Fi"| Switch
        Switch --> Printer
    end
    Chromebox -->|"Internet / HTTPS"| Vercel["Vercel<br/>React SPA"]
```

**Hardware decisions (see `/docs/research/kiosk-hardware.md` for full rationale):**

| Component | Choice | Why |
|---|---|---|
| Compute | Chromebox (ASUS/HP G3) | Chrome OS Kiosk Mode — boots to a single URL, no escape |
| Display | 24" 1080p monitor | Shared station; students stand at desk |
| Scan camera | IPEVO V4K Pro (USB) | US K-12 standard; browser sees as webcam via `getUserMedia()` |
| Check-in | IPEVO camera + jsQR in browser | No separate barcode gun; a few seconds is acceptable |
| Printer | Existing school LAN printer | Already present; Chrome Print API handles it |
| Audio/voice | Deferred — not a v1 requirement | |

---

## 2. Software Topology

```mermaid
graph TD
    subgraph Kiosk["Kiosk — Chrome OS Kiosk Mode"]
        Browser["Chrome Browser"]
        IPEVO2["IPEVO V4K<br/>getUserMedia()"]
        LanPrinter["LAN Printer<br/>Chrome Print API"]
        Browser -->|getUserMedia| IPEVO2
        Browser -->|Chrome Print API| LanPrinter
    end

    Browser -->|HTTPS| Vercel["Vercel Edge<br/>React SPA"]

    Vercel -->|HTTPS| SG["skill-graph :3001<br/>BKT · Frontier · Leaf ledger · Sessions"]
    Vercel -->|HTTPS| WS["worksheet :3002<br/>LLM gen · PDF render via Playwright"]
    Vercel -->|HTTPS| EV["evaluator :3003<br/>Scan align · Crop regions · LLM grade"]

    SG & WS & EV --> DB[("Supabase Postgres<br/>kc_states · sessions · session_tasks<br/>print_events · kcs · kc_edges · tasks")]

    WS -->|problem generation| Gemini["Gemini API<br/>Flash / Pro"]
    EV -->|multimodal eval| Gemini

    SG -->|"session events — Phase 2"| BHCS["BHCS Portal<br/>Student identity · Parent portal · Auth"]
```

---

## 3. User Flow: Check-in

```mermaid
sequenceDiagram
    actor Student
    participant Kiosk as Kiosk (browser)
    participant SG as skill-graph

    Student->>Kiosk: holds QR badge to IPEVO camera
    Kiosk->>Kiosk: jsQR polls video frame → extracts student_id
    Kiosk->>SG: GET /students/:id/state
    SG-->>Kiosk: { leaf_balance, radar, last_session }
    Kiosk-->>Student: session screen — radar chart + leaf balance
```

**Critical path:** QR decode must work reliably in classroom ambient light. The IPEVO LED ring light is always on during check-in. If QR fails: fallback to PIN (not yet designed — open question in user-stories.md).

---

## 4. User Flow: Print Card (Leaf gate is a transaction boundary)

```mermaid
sequenceDiagram
    actor Student
    participant Kiosk
    participant SG as skill-graph
    participant WS as worksheet
    participant Gemini as Gemini API
    participant Printer

    Student->>Kiosk: "Get my Card"
    Kiosk->>SG: POST /next-task
    SG-->>Kiosk: { task_id, kc_ids }
    Kiosk->>WS: POST /generate { student_id, task_id }
    WS->>SG: GET /leaf-balance
    SG-->>WS: { balance: N }

    alt N < 1
        WS-->>Kiosk: 402 insufficient_leaves
        Kiosk-->>Student: "No Leaves" — Docent message
    else N >= 1
        WS->>Gemini: generate problems JSON
        Gemini-->>WS: { problems }
        WS->>WS: HTML → PDF via Playwright + embed QR code
        WS->>SG: POST /leaf-events { type: "spend", amount: 1 }
        SG-->>WS: OK
        WS-->>Kiosk: PDF bytes
        Kiosk->>Printer: Chrome Print API
        Printer-->>Student: paper Card
        opt printer error
            Kiosk->>SG: POST /leaf-events { type: "refund", amount: 1 }
        end
    end
```

**Transaction rule:** Leaf spend and print are not atomic at the hardware level. The refund event on printer failure is the compensating transaction — `print_events` is append-only, no modifications ever.

---

## 5. User Flow: Submit Card + Evaluate (core flywheel step)

```mermaid
sequenceDiagram
    actor Student
    participant Kiosk
    participant EV as evaluator
    participant WS as worksheet
    participant SG as skill-graph
    participant Gemini as Gemini API

    Student->>Kiosk: places completed paper under IPEVO
    Kiosk-->>Student: live preview in browser
    Student->>Kiosk: "Submit"
    Kiosk->>EV: POST /evaluate { image, task_id, student_id }
    EV->>WS: GET /tasks/:id
    WS-->>EV: { answer_regions, rubric }
    EV->>EV: align scan to QR + fiducials, crop per-problem regions
    EV->>Gemini: multimodal eval — all problem crops batched in one call
    Gemini-->>EV: [{ tier, error_pattern, confidence, transcript }]
    EV->>SG: POST /attempts — triggers BKT update + Leaf earn
    SG->>SG: BKT update + POST /leaf-events { type: "earn", amount: 1 }
    EV-->>Kiosk: EvaluationResult
    Kiosk-->>Student: Debrief on screen
    opt needs_teacher_review
        Kiosk->>SG: flag session for teacher review queue
    end
```

**Target latency:** ≤30s from camera capture to Debrief displayed (p95). Batch all problem crops into a single Gemini call — one call per submission, not one per problem.

---

## 6. User Flow: Teacher Review

```mermaid
sequenceDiagram
    actor Teacher
    participant Dashboard as Teacher Dashboard
    participant SG as skill-graph
    participant BHCS as BHCS Portal

    Teacher->>Dashboard: login
    Dashboard->>SG: GET /sessions?needs_review=true
    SG-->>Dashboard: sessions list
    Dashboard-->>Teacher: scan image + AI eval side by side
    Teacher->>Dashboard: approve / override / flag question
    Dashboard->>SG: POST /session-tasks/:id/review { approved, override_tier, note }
    SG-->>Dashboard: OK
    Note over SG,BHCS: Phase 2
    SG->>BHCS: push session to parent portal
```

**Trust arc (from user-stories.md):** Phase 1 = every evaluation reviewed before parent sees it. Phase 2 = only `needs_teacher_review: true` flagged cases. Phase 3 = async monitoring. The dashboard is **not polish** — it is load-bearing for teacher adoption.

---

## 7. Security and Trust Boundaries

```mermaid
graph LR
    subgraph BHCS["BHCS Portal — auth boundary"]
        PII["PII · passwords · billing<br/>parent portal<br/>issues opaque student_id"]
    end

    subgraph Atrium["Atrium — no-PII zone"]
        State["student_id + skill state only"]
        Ledger["print_events<br/>append-only · no deletes"]
        Review["needs_teacher_review = true<br/>held until teacher approves"]
        Audio["audio: transcribed<br/>then discarded"]
    end

    BHCS -->|"student_id only — no PII crosses"| Atrium
    Atrium -->|"session events (Phase 2)"| BHCS
```

---

## 8. Critical Design Tensions (stay honest about these)

| Tension | Current answer | When to revisit |
|---|---|---|
| **Latency vs cost** | Single Gemini API call with all problem crops batched | If p95 > 30s, consider Flash for transcript + Pro only for borderline tiers |
| **Scan reliability** | Fixed-template alignment (QR + 3 fiducial marks) | If QR is occluded by student writing: fall back to fiducials only |
| **Leaf transaction atomicity** | Compensating refund event on printer failure | If printer never reports failure reliably: add a "print confirmation" UI step |
| **Teacher review throughput** | Phase 1 = 100% review | If teacher load is too high at pilot: accelerate to Phase 2 (flagged-only) earlier |
| **Check-in fallback** | QR badge via IPEVO camera | Badge lost/damaged: PIN fallback not yet designed — open question |
| **Chromebox ↔ printer** | Chrome Print API to LAN printer | Some school networks block device-to-device traffic — verify early |
| **Single IPEVO serves dual roles** | Check-in QR scan + worksheet submission capture | Camera cannot do both simultaneously — kiosk UI must enforce sequential mode (check-in → session → scan), never concurrent |

---

## 9. What is explicitly NOT in this architecture

- Student passwords or PII — lives only in BHCS portal
- Homework help / open chatbot — Atrium chat is task-scoped only (anti-story)
- Parent grade overrides — teachers only
- Printing without a prior submission — enforced by Leaf gate in worksheet service
- Voice I/O — deferred from v1
- Dedicated QR badge hardware scanner — replaced by IPEVO camera + jsQR

---

## References

- `/docs/research/kiosk-hardware.md` — hardware decision log and rationale
- `/product/tech-spec.md` — service contracts, DB schema, performance targets
- `/product/user-stories.md` — personas and acceptance criteria
- `/docs/pedagogy/eco-design.md` — Leaf economy full spec
- `/docs/pedagogy/teacher-direction.md` — teacher trust arc and review queue design
- `/docs/research/paper-interaction.md` — scan pipeline precedents (Gradescope, Xiaoyuan)

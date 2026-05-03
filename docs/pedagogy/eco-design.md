# Eco-First Design — The Leaf Economy and Sustainable Printing

> Paper-first does not mean paper-profligate. This document defines how Atrium treats printing as an earned, accountable act — not an automatic output.

---

## The core principle

Every sheet of paper printed is a real cost: environmental, financial, and pedagogical. A student who prints without submitting has consumed a resource without contributing to their learning loop. The Leaf economy prevents this by making submission the unlock mechanism for the next print — not a teacher approval, not a payment, but the act of completing work itself.

This is not punitive. It is the flywheel, made visible.

---

## The Leaf economy

### What is a Leaf?

A **Leaf** is Atrium's print-credit unit. The name is intentional: an atrium has plants; plants grow leaves; students grow knowledge. Earning and spending Leaves is how the growth metaphor becomes tangible.

### How Leaves are earned

| Event | Leaves earned |
|---|---|
| Submitting a completed Card (any quality tier) | +1 |
| Completing a placement/bootstrap evaluation | +2 (first-session seed) |
| New enrollment (semester start) | +2 (bootstrap allowance) |
| Teacher bonus grant (exceptional work, make-up) | +N (teacher-set) |

The quality tier of the submission does not affect Leaf earnings. A student who submits a Card that scores "not-yet" still earns a Leaf — the goal is to reward the *act of attempting and returning*, not correctness alone. Quality is addressed through the Debrief and the next Card assignment.

### How Leaves are spent

| Action | Leaves spent |
|---|---|
| Printing a new Card (worksheet) | 1 |
| Re-printing a lost or damaged Card | 1 |
| Printing the Debrief report | 0 (always free) |

The Debrief never costs a Leaf. Printing the Debrief supports re-engagement: a student who takes their feedback home is more likely to return. The paper cost of a one-page Debrief is worth the loop reinforcement.

### Leaf balance rules

- **Balance floor: 0.** A student with 0 Leaves cannot print. The kiosk explains this clearly and offers two paths: (a) ask the teacher for a Leaf grant, or (b) submit a pending Card they may have left incomplete.
- **Balance ceiling: 5.** A student cannot accumulate more than 5 Leaves. This prevents hoarding and encourages steady engagement over binge printing.
- **Leaves do not expire** within an enrollment period (semester). They reset to 0 at the end of an enrollment period unless explicitly carried over by a teacher.
- **Leaves are per-student, not per-session.** They persist across Visits.

### Edge cases

| Scenario | Resolution |
|---|---|
| First-time student, 0 Leaves, wants to print | System grants 2 bootstrap Leaves on first enrollment |
| Card print fails (printer jam, paper out) | Leaf is refunded automatically — log the print failure, revert the deduction |
| Student submits a Card that was clearly not their work | Teacher can mark it void; the Leaf award is revoked and logged |
| Teacher wants to run a group activity requiring fresh Cards for everyone | Teacher grants a class-wide +1 via the dashboard in one action |
| Student loses their Card before submitting | They can re-print for 1 Leaf (the same cost as a fresh print) — this prevents gaming but does not penalize accidental loss harshly |

---

## Digital-first defaults

Printing is the exception, not the default. Every surface that could produce paper should ask "is digital sufficient here?" first.

| Artifact | Default | Print trigger |
|---|---|---|
| Card (worksheet) | Printed — this is the core physical artifact | Always printed when student confirms; costs 1 Leaf |
| Debrief | **Digital-first**: shown on screen at end of Visit | Student or teacher can request a printed copy; 0 Leaves |
| Radar chart | Always digital | Never printed from kiosk (parents view via portal) |
| Session summary (parent) | Always digital — pushed to BHCS portal inbox | Not printed from kiosk |
| KC description / hint sheet | Always digital — shown in Chat mode | Never printed |

### Worksheet density

Multi-problem Cards are the default. The market research (`/docs/research/paper-interaction.md`) flagged this as a trade-off: one problem per page is easier to scan; many per page is more efficient. **Resolution: 3–5 problems per Card, max one page (A4 / Letter), with fixed answer regions sized for a 7-year-old's handwriting.** The scan-alignment system handles multi-problem Cards via fixed template coordinates — this is the Gradescope pattern.

Never print a Card that is mostly blank space. If a KC only generates one or two problems at the appropriate difficulty, the generator must pad to fill the page with supplementary practice problems at the same or adjacent KCs.

### Double-sided printing

Enable when the printer supports it. Cards are always single-sided (the back is blank for scratch work — do not print on it, or the scanner may pick up bleed-through). Debriefs can be double-sided.

---

## Branding and visual language

### In the kiosk UI

The Leaf balance is always visible during a Visit — top-right corner, small but present, like a currency indicator in a game. Display format:

```
🌿 2 Leaves
```

When balance is 0:
```
🌿 0 Leaves  ·  Submit your Card to earn one
```

When balance is at ceiling (5):
```
🌿 5 Leaves  ·  Print your next Card to keep growing
```

The Docent's voice lines reinforce this without moralizing:
- On earning a Leaf: *"Nice work! You just grew a new Leaf. Ready to print your next Card?"*
- On 0 balance: *"You're out of Leaves for now. Turn in your Card and you'll earn one right away."*
- On printing: *"Here comes your Card! One Leaf used — you've got [N] left."*

Never say "you can't print" or "printing is blocked." Frame it as earning, not restriction.

### Color accent for eco elements

Introduce a soft green (`#4a7c59`) as the Leaf accent color alongside the existing palette:

| Element | Color |
|---|---|
| Leaf balance indicator | `#4a7c59` (eco green) |
| Leaf icon (🌿 or SVG leaf) | `#4a7c59` |
| Print confirmation button | Existing navy `#1a1a2e` — eco green border only |
| Zero-balance state | Muted amber `#c8963e` — a "low resource" signal, not red/alarming |

Do not make eco elements red or alarming. The message is abundance (earn Leaves, grow, thrive), not scarcity or guilt.

### Parent-facing framing

In the BHCS parent portal session report, include a Leaf line alongside academic progress:

> *Leaves earned this session: 1 · Total this semester: 7 · Cards printed: 6*

Below that, one line: *"Atrium students only print when they've completed their previous Card — [student name] has been consistent."*

This frames eco-consciousness as a positive habit signal, not a constraint.

### Teacher-facing framing

In the teacher dashboard:
- Class Leaf summary: total Leaves earned vs. Cards printed across all students this week
- Sheets saved metric: `(Leaves earned − Cards printed) × 0` is always ≥ 0 by design; track absolute sheets printed per student per week and flag outliers (teacher can investigate whether a student is re-printing vs. churning through Cards)
- Grant Leaf button: one-click, logs the reason (from a dropdown: "make-up", "first session", "group activity", "teacher discretion")

---

## Metrics to track

These belong in the teacher dashboard and eventually the BHCS portal analytics:

| Metric | Definition | Why it matters |
|---|---|---|
| Cards printed per session | Count of Card prints in a Visit | Baseline; should be 1 in a normal 30-min session |
| Submission rate | Submitted Cards / Printed Cards | Should approach 1.0; gap = abandoned paper |
| Debrief print rate | Debriefs printed / Sessions | Optional; signals engagement with feedback |
| Leaves earned vs. spent ratio | Earned / Spent over time | Should trend toward 1.0; runaway surplus = under-printing; deficit impossible by design |
| Sheets saved vs. unconstrained | Estimate: (sessions × avg-sheets-without-gate) − actual sheets | Eco impact narrative for parent communications |

---

## Implementation checklist (by phase)

### Phase 0 — Schema

- [ ] Add `leaf_balance int not null default 0` to student state (or a separate `student_print_state` table)
- [ ] Add `print_events` table: `student_id`, `event_type` (earn | spend | grant | refund), `amount`, `reason`, `session_id`, `created_at`
- [ ] Seed bootstrap Leaves for test students

### Phase 1 — Print gate

- [ ] `POST /worksheet/generate` checks `leaf_balance >= 1` before generating PDF; returns `402` with `{ error: "insufficient_leaves", balance: 0 }` if blocked
- [ ] On successful PDF delivery, deduct 1 Leaf and log a `spend` print event
- [ ] On printer error (non-2xx from print API), issue a `refund` event
- [ ] Kiosk Chat mode shows Leaf balance in UI; zero-balance state shows Docent message
- [ ] Submission evaluator awards +1 Leaf on successful scan acceptance and logs an `earn` event

### Phase 2 — Teacher controls

- [ ] Teacher dashboard: Leaf grant button with reason dropdown
- [ ] Class Leaf summary widget
- [ ] Submission-rate metric per student per week

### Phase 3 — Parent visibility + polish

- [ ] Parent portal: Leaf count in session report line
- [ ] Docent voice lines for Leaf earn/spend events
- [ ] Eco impact summary in end-of-semester parent report

---

## What not to build

- **A Leaf marketplace or trade.** Students cannot give Leaves to each other. Leaves are earned individually; social transfer creates cheating incentives.
- **A penalty system.** Leaves never go negative. Never threaten, warn, or shame a student for having 0. The zero state is a natural pause, not a punishment.
- **A pay-to-print bypass.** No mechanism should allow a student to print without a Leaf regardless of payment or parent override — the gate is the policy. Teachers can grant Leaves, which achieves the same outcome with an audit trail.
- **Eco-shaming copy.** The Docent never says "save the trees" or "don't waste paper." The system communicates eco values through *structure* (earn to print), not through moralizing language.

---

## References

- `/docs/research/paper-interaction.md` — Kumon's paper-first model; why paper is a trust signal with parents, not a liability
- `/docs/pedagogy/teacher-direction.md` — Teacher grant authority; override log patterns
- `CLAUDE.md` — Operational reality and flywheel; Leaf in domain model and glossary
- `infra/supabase/migrations/` — Schema for `student_print_state` and `print_events`

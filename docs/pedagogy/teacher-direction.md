# Teacher Direction Research

> How a traditional teacher — not yet comfortable with AI — builds trust with the system and evolves into a multiplier who reaches far more students than before.

## The core design principle

A skeptical teacher needs a *trust runway*, not a leap of faith. Every AI decision must be inspectable: why this KC was assigned, why this answer was marked "shaky," what rubric criterion it failed. If the teacher can see the reasoning and disagree with it, they'll calibrate — finding the AI reliable on routine cases and wrong in predictable ways they can correct. Transparency is the mechanism by which trust is earned.

Architecturally: every AI-generated grade is provisional until the teacher has sufficient confidence to stop reviewing it. The system never assumes that trust; it earns it phase by phase.

---

## The trust-building arc (three phases)

### Phase 1 — Observer / Auditor (weeks 1–4)

The AI generates; the teacher approves before anything reaches students.

- Every AI evaluation sits in a **review queue** before it's shown to the student or sent to parents.
- Teacher sees: the student's scan, the AI's handwriting transcript, the grade, and the explanation in plain language — e.g. "marked as 'needs help' on problem 3 because the denominator was ignored when finding the common denominator."
- Teacher can override with one click and optionally add a note. That note becomes training signal.
- Teacher can flag a generated question as bad (wrong difficulty, confusing wording, culturally off).

The mental model for the teacher: *the AI is a TA who does the first pass; I still sign off.* This mirrors how they'd work with a student teacher.

### Phase 2 — Collaborator (months 2–3)

Teacher has seen enough evaluations to calibrate. They've reviewed ~200 AI grades, corrected ~20, and noticed patterns. Now:

- Move to **flagged-only review**: AI surfaces low-confidence grades (unclear handwriting, unrecognized solution approach), novel error patterns it hasn't encountered before, and students whose skill-tree trajectory looks anomalous.
- Teacher overrides compile into a **rubric refinement log**: "You've overridden the 'equivalent fractions' rubric 8 times. Here's the pattern. Want to update the rubric?"
- Teacher can now **author KC definitions** — name a new skill node, describe what mastery looks like, provide 2–3 example problems. The AI generates variations from that seed.

### Phase 3 — Multiplier (month 3+)

Teacher's domain knowledge is encoded in the system. Their time is freed for the cases where human judgment is irreplaceable.

**AI handles:** routine grading, task assignment, progress tracking, first-pass bilingual feedback.

**Teacher handles:**
- Students who are frustrated or disengaged (affective signals the AI cannot read)
- Novel misconceptions the AI escalates
- Parent conversations that need nuance
- Cross-student pattern recognition ("half my class is failing the same fraction KC — something is wrong with the worksheet template")

**Reach expands:** instead of giving individual attention to 20 students in a 40-minute session, a teacher can asynchronously monitor 50–100 student records, drill into outliers, and write a targeted intervention note that appears at the student's next kiosk visit.

---

## What the system must build for this to work

### Teacher-facing dashboard
- Review queue with one-click approve/override and AI rationale always visible
- Radar chart view across all students, sortable by "struggling most" or "recently visited"
- Per-student session timeline: what was assigned, what was submitted, how it was graded, what changed in skill state
- Alert feed: "Student #14 has attempted the same KC 4 times with no mastery gain — possible misconception or motivation issue"

### Override and feedback loop
- Every teacher override is logged and reflected back: "Your overrides suggest the 'word problem comprehension' rubric is too strict — confirm to loosen it?"
- Teacher corrections improve future AI behavior (rubric-level prompt updates, or fine-tuning signal later)

### Authoring surface
- **KC editor:** describe a skill, define what mastery looks like, provide 2–3 exemplar problems
- **Question reviewer:** before any AI-generated question template goes live, teacher approves it once ("this template is good — use it going forward")
- **Rubric editor:** adjust what "shaky" vs. "mastered" means for a specific KC

### Escalation protocol
- Hard cases bubble up to teacher with full context, not just the raw scan
- Teacher response is asynchronous — they do not need to be physically present at the kiosk

---

## The multiplier math

| Mode | Teacher reach | Individual attention quality |
|------|--------------|------------------------------|
| Traditional (no AI) | ~25 students / session | Shallow; no persistent diagnostic record |
| AI-assisted (Phase 3) | 50–100 sessions monitored async | Deep on the ~10% the AI flags; live time reserved for relationship and motivation |

The teacher does not become redundant. They become the **exception handler and curriculum authority** for a system that handles the routine. Their expertise is what makes the AI's rubrics accurate. Their overrides are what improve it over time.

---

## The trust signal to watch for

The inflection point is when a teacher starts *adding* KCs rather than just approving them. At that moment they have shifted from auditor to co-author — and they have skin in the system working well. That is the target end state.

---

## Open questions for teacher onboarding

1. What is the minimum review queue size that makes a teacher feel "in control" without burning them out? Too many reviews and they disengage; too few and they don't build calibration.
2. Should the review queue be synchronous (teacher reviews before student gets feedback) or asynchronous (student gets provisional feedback, teacher can revise it)? Synchronous is safer for trust-building but adds latency.
3. How do we handle a teacher who overrides the AI incorrectly? The system should never silently discard a correction, but it also should not blindly encode a teacher's mistake into the rubric.
4. What is the right escalation threshold? Too many escalations and the teacher is overwhelmed; too few and genuine hard cases slip through unreviewed.
5. How do teachers share rubric improvements across classrooms or cohorts? A rubric refined by one teacher should be proposable to others, not siloed.

---

## References

- See `/docs/research/competitive-landscape.md` for commercial analogs (Squirrel AI, Khanmigo, Century Tech) and their teacher-facing surfaces.
- See `CLAUDE.md` for the full domain model, flywheel, and operational constraints this research sits within.

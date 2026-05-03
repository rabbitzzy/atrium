# Competitive Landscape — AI Tutoring Market

> Part of the market research for Atrium. See also: [paper-interaction.md](./paper-interaction.md), [open-source-stack.md](./open-source-stack.md), [design-patterns.md](./design-patterns.md), [open-questions.md](./open-questions.md).

The point of this doc is to keep us honest. The space of "AI tutoring" is overpopulated; the *intersection* of (paper-first + shared kiosk + dynamic skill tree + chess.com-style coaching + bilingual) is sparser. Most of our differentiation lives in the integration, not in any single component. Don't rebuild what already works.

## TL;DR

- The closest commercial analog is **Squirrel AI** (China; entering US 2026). Study them carefully — they validate the "physical center + adaptive AI + fine-grained KCs" thesis at scale, and they will be a competitor or a reference point depending on how you position. Their "nano-level" knowledge points and proprietary tablets are the only well-funded predecessor doing roughly what we want.
- For open source, the unambiguous picks are **OATutor** (a Berkeley open-source ITS architecture you can study or fork), **pyBKT** (the student modeling library), and **Pix2Text** (a free Mathpix alternative that handles Chinese).
- The chess.com analogy is real and useful — **Aimchess** in particular has the radar chart + per-aspect coaching pattern we want.
- Multimodal LLMs (Claude, Gemini, GPT-4o) can transcribe handwritten student work at 97–99% accuracy in published studies. They are *adequate* graders for formative feedback but *not* high-stakes. Bake that into product positioning.
- Don't build: skill mastery algorithms, math handwriting OCR, worksheet templating, fine-grained KC taxonomies, or any rubric-grading prompt scaffolding from scratch. All of it exists.

## Closest commercial analog: Squirrel AI

Squirrel AI is the only well-funded company doing roughly what we want at scale, and the comparison is worth a careful look.

What they do well:
- Fine-grained knowledge graph: they break academic subjects into ~"tens of thousands" of nano-KCs and use that granularity to localize student gaps precisely. This is their core IP.
- Physical learning center model: 1,700+ centers worldwide, smart-tablet hardware, AI-driven content + human teacher mini-lessons. Validates the "shared physical space + AI" thesis.
- Closed-loop pedagogy: assessment → practice → learning → testing → teaching, on a single device. Their "IALS" (Intelligent Adaptive Learning System) is the clearest articulation of the flywheel we're building.
- Published efficacy: a 2020 PNAS study showed comparable learning gains to experienced human tutors; recent international deployments report ~1.2 grade-level gains in math over 6+ months.

What they do not do (and why we have room):
- Not paper-first. They built around tablets — every interaction is screen-based. Our "scan + printer" interface is genuinely different.
- Not bilingual at the BHCS level. Their US offering is K-5 English-only math at launch.
- Not community-rooted. They're a franchise model. We are one school's tool, deeply embedded in a community.
- Not transparent. The "nano-KC" graph is proprietary; teachers can't author or audit it. Ours should be auditable and authorable from day one.

Verdict: Squirrel AI is a North Star reference, not a direct competitor at our scale. Borrow their granularity philosophy. Differentiate on transparency, paper-first design, and bilingual fluency.

## Other commercial players to know

Brief, just for vocabulary:

- **Khanmigo** (Khan Academy) — GPT-4 Socratic tutor. Free tier, large content library, strong pedagogy. School-district sales motion. Read their public design docs for prompt patterns; don't try to compete on content breadth.
- **Carnegie Learning MATHia** — adaptive math tutor with cognitive-science roots. Long-running, well-researched. Their student model literature is worth reading (Ken Koedinger's work).
- **ALEKS** — knowledge space theory (a graph-based mastery model that predates BKT). Mature, used in higher ed.
- **DreamBox / Century Tech / Querium / Cognii** — various flavors of adaptive tutoring; mostly screen-first.
- **MagicSchool / Eduaide / Diffit / Monsha** — teacher-facing AI worksheet generators. Useful as components: their prompt patterns for "generate a worksheet on X for grade Y aligned to standard Z" are mature. We are essentially the *student-facing* counterpart that closes the loop.
- **Gradescope** (Turnitin) — auto-grading from scanned handwritten work. Their "fixed-template overlay" pattern (align student submission to blank template, extract diff in the answer regions) is the right pattern for our scan step. **Steal this directly.**
- **Synthesis Tutor / Numerade / Photomath** — niche tools (K-5 math, college STEM, problem solver). Not analogs but useful for tone/style references.
- **Toddle, Merlyn Mind** — voice-AI in classroom contexts. Merlyn Mind in particular has a published voice-privacy framework worth reading if we put a microphone in front of children in a shared space.

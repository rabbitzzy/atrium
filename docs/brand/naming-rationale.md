# Code Names — BHCS Student AI Hub

Five candidates. All single-word, easy to type, evocative of the product's core (skill tree + self-serve hub + growth-over-time feedback). Pick one for the repo; you can rename the public product later.

## 1. Banyan
The banyan tree has many roots feeding one canopy — the cleanest visual for a skill tree where language, math, art, and science branches share aerial roots (cross-subject curriculum). Strong cultural resonance for BHCS families: the banyan is iconic in Chinese, Indian, and Southeast Asian traditions, often planted at village centers as gathering points — which mirrors the "shared kiosk" hardware. Easy to pronounce, available as a domain-ish word (no major tech namespace conflict). My top pick.

## 2. Trellis
A trellis is a structure that supports growing things — exactly what an adaptive learning system does for a student. Branching geometry maps to the skill tree without the heaviness of "tree" itself. Verb form ("trellis a curriculum") is intuitive. Slightly more technical/architectural feel than Banyan, which suits an AI infrastructure repo.

## 3. Loom
A loom weaves separate threads into a single fabric — a strong metaphor for cross-subject branches (the language thread crossing the math thread to make a word problem) and for the flywheel itself (assessment → worksheet → submission → feedback → re-plan, woven repeatedly). Bonus: "loom" also means to grow larger on the horizon — a quiet nod to Bright Horizon. Short, memorable, reads well in code (`loom-server`, `loom-portal`).

## 4. Atrium
An atrium is the open central space of a building — light from above, gathering below. Captures the physical kiosk reality (shared monitor + scanner + printer in a community space) better than any organic metaphor. Calm, modern, slightly classical. Good if you ever want to position the product to schools as "a learning atrium" rather than software.

## 5. Lodestar
A lodestar is a guiding star sailors used for navigation — the chess.com-style coaching analogy made literal. The system doesn't just say "right/wrong"; it points toward the next thing to work on. Also a clean tie to *Bright Horizon* (light + direction). Slightly more poetic than the others — better as the product name than the repo name.

---

## Quick decision matrix

| Name      | Skill tree fit | Hub/kiosk fit | Coaching fit | Cultural fit | Repo-friendly |
|-----------|----------------|---------------|--------------|--------------|---------------|
| Banyan    | ★★★★★         | ★★★★          | ★★           | ★★★★★        | ★★★★          |
| Trellis   | ★★★★★         | ★★            | ★★★          | ★★           | ★★★★★         |
| Loom      | ★★★★          | ★★            | ★★★          | ★★★          | ★★★★★         |
| Atrium    | ★★             | ★★★★★         | ★★           | ★★★          | ★★★★          |
| Lodestar  | ★★             | ★★            | ★★★★★        | ★★★          | ★★★           |

If forced to pick one for the repo right now: **Banyan** — it's the most distinctive and the metaphor is structurally correct (multi-root, multi-canopy, cross-connecting aerial roots = the dynamic skill tree you described). If you want something more sterile/technical for an infra repo: **Trellis**.

---

## ★ Decision: Atrium — brand rationale

### The case for it

**Bright is in the DNA.**
An atrium is defined by light — natural light from above, diffused through an open space below. The school is called *Bright Horizon*. That's not a coincidence; it's a direct brand resonance no other candidate has. Banyan and Trellis evoke structure; Lodestar evokes direction; Loom evokes process. Atrium evokes *illumination* — the emotional register you want for a learning product for children: warm, open, lit from within.

**It names the physical reality exactly.**
Every other candidate is a metaphor for the software. Atrium is a metaphor for the *room*. Students don't "use Atrium" — they *come to* Atrium. They gather, work, and leave. The shared kiosk is already the spatial anchor of the experience; the name makes that concrete. No other candidate captures the communal, place-based quality of a station that multiple students rotate through in a single afternoon.

**It's calm and institutional in the right way.**
Banyan feels warm and familial. Trellis feels like developer infrastructure. Atrium feels like a building that has been there a while — a library wing, a museum gallery, a school's central commons. That calm, modern-classical register communicates permanence and trust to parents and teachers before a single feature is explained. For a product where teacher trust is load-bearing (see `/docs/pedagogy/teacher-direction.md`), that tone matters.

**It's clear in the edtech namespace.**
No major edtech product is named Atrium. The word appears in biotech (Atrium Health) and enterprise SaaS, but the K–12 learning space is open. That matters as the product grows beyond BHCS.

---

### Addressing the weak scores in the matrix

The matrix gave Atrium ★★ on both **skill tree fit** and **coaching fit**. Those ratings assumed the name had to *announce* its metaphor on first contact. The reframe: Atrium doesn't announce its structure — it *contains* the structure. Once you commit to the spatial vocabulary, both ratings become irrelevant in practice.

**Skill tree fit — the architecture reframe.**
An atrium isn't featureless. It has floors, balconies, columns, load-bearing walls, and a glass ceiling. That *is* a hierarchy — vertical levels, lateral connections between floors, and light increasing as you ascend. The skill tree maps cleanly once you adopt the spatial model:

- **Floors** = subject domains (math, language, art, science)
- **Levels** = mastery depth within a domain (foundational → developing → fluent → mastered)
- **Walkways and bridges** = cross-subject KC edges (the word-problem link between math/arithmetic and language/reading-comprehension)
- **Elevation** = mastery — students are always moving upward toward the light

The design team holds this model internally; it doesn't need to be spelled out in the UI. It just keeps the product coherent as it grows.

**Coaching fit — the docent reframe.**
The matrix docked Atrium points by comparing it to Lodestar's "guiding star" metaphor. But a distant star is a poor coaching model. A **docent** is a better one — and a docent belongs in an atrium.

A docent doesn't teach the building; they walk beside you, read your pace, answer questions when you have them, and point toward what's worth pausing at. They're present, contextual, and responsive. That's exactly the AI persona this product needs: not a voice from above (Lodestar), not a structure you grow into (Banyan/Trellis), but a guide who meets you where you are.

This framing also directly addresses the core constraint around trust: a docent is *transparent by design*. They explain what they're showing you and why. The product's AI-graded, AI-explained, fully parent-visible reports are the docent's natural output — not a disclaimer bolted on, but the soul of the metaphor.

---

### Naming system that follows from Atrium

The internal design language becomes spatial and architectural — consistent across backend, frontend, and docs:

| Concept | Atrium term |
|---|---|
| The app / product | Atrium |
| The skill tree | The Blueprint |
| A knowledge component (KC) | A Room |
| Student mastery state | Floor plan |
| The AI assistant | The Docent |
| A kiosk session | A Visit |
| A printed worksheet | A Card |
| The feedback report | The Debrief |
| Student's frontier KCs | The Landing |
| A print credit | A Leaf |
| A creative contribution (drawing, comic, story scan) | An Exhibit |
| Parent-facing view of a student's creative work | The Gallery |
| Aggregated creative themes used for task personalization | Interest profile |

The Leaf name earns its place: an atrium has plants; plants grow leaves; students grow knowledge. Earning a Leaf by completing a Card and spending it to grow a new one closes the metaphor without moralizing. It is age-appropriate, easy to explain to a 7-year-old, and gives teachers a concrete vocabulary for the eco-first print policy ("you need a Leaf to print your next Card").

These are internal terms, not necessarily UI copy. Having them consistent from day one prevents the drift where the backend calls it a "node", the UI calls it a "skill", the teacher dashboard calls it a "topic", and new contributors spend a week just learning the vocabulary.

---

### One-line positioning statement

> **Atrium** — a shared learning space where every child arrives to a personalized path, and leaves a little further along it.

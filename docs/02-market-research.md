# Market Research — What Exists, What to Borrow, What Not to Reinvent

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

## Paper-based interaction: what exists, what succeeded, what failed

This is the thinnest part of the existing landscape — most EdTech went screen-first — which is both a risk (we have fewer models to copy) and an opportunity (we are not replicating a commodity). Here is what is actually out there, why each one succeeded or failed, and what it implies for us.

### Products that bridge paper and digital

**Gradescope** (acquired by Turnitin, 2021) — the reference implementation.
Gradescope digitizes handwritten and printed work via scan, then applies rubric-based AI grading. Their core technical insight — the "fixed-template overlay" — is the right answer to scan alignment: every submission is registered against a blank copy of the same template, and answer regions are extracted by diff, not by free-form OCR. This makes handwriting recognition dramatically more reliable because the system knows exactly where each answer should be. 97%+ accuracy on college-level work; lower on messier K-5 handwriting. They grew to cover ~1,700 institutions before acquisition. The success formula: saved real teacher time (50% grading time reduction in studies), produced fairer rubric-based grades, and required no special hardware beyond any scanner or phone camera. Not designed for elementary learners, not bilingual, not adaptive — but the scan pipeline is ours to copy outright.

**Scantron / Akindi / OMR bubble sheets** — the commodity path.
Optical mark recognition on bubble sheets is 99.7%+ accurate and has been the K-12 testing backbone for 50 years. The constraint is severe: bubble sheets limit you to multiple choice. Akindi is the modern, phone-camera-friendly version (free for K-12 with limits, no dedicated scanner needed). If we ever want a fast daily quiz format with MC questions, Akindi is a drop-in. Not our primary path — we need open-ended handwritten answers — but worth knowing.

**Kumon** — the paper-first tutoring benchmark.
Kumon runs on printed worksheets, incremental skill progression, and mastery gating. 4 million students. 40,000+ centers. 65+ years old. Their model validates that paper-based learning at scale is viable and that parents trust physical work artifacts. The failure mode is the ceiling: no adaptive feedback, no AI, a teacher is essentially a supervisor who hands out the next worksheet. Students hit a rote-repetition wall and disengage. Kumon is what we look like if we ship paper without the adaptive AI layer. It is also what gives us the confidence that the physical-paper model is not a liability — it is a feature that earns parent trust.

**Osmo (Tangible Play)** — physical objects + camera recognition, K-5 specific.
Osmo clips a mirror to an iPad and uses the camera to recognize physical objects placed on a table — letter tiles, paper drawings, colored blocks. The games (Tangram, Words, Newton) make the physical-digital bridge feel magical to a 6-year-old. Won awards, had strong initial engagement, went bankrupt, was acquired and revived in late 2025. The success: physical interaction is more motivating for young children than tap-on-screen for learning tasks. The failure: required a specific iPad model + hardware accessory, making it too fragile as a product. The lesson for us: use a camera that is already part of the station and avoid proprietary physical artifacts.

**LeapFrog LeapReader / Tag** — special printed paper + stylus, K-2 reading.
The Tag system sold 2M+ readers and 6M+ books by putting Anoto dot patterns on children's storybooks. Tap the word, hear it spoken. Tap a character, hear a line. This is the only mass-market paper-AI product ever built specifically for K-2 learners — and it worked. The failure mode was a supply chain: the paper had to be specially printed, which meant the content library was capped by LeapFrog's publishing capacity. When cheap iPad apps arrived with unlimited content, the proprietary paper model collapsed. The lesson: if the paper requires special printing infrastructure the school cannot control, it becomes a dependency that will eventually fail. Our worksheets must be printable on any standard laser printer.

**Anoto digital pen** — the cautionary tale.
Anoto built a pen with a tiny camera that reads microscopic dot patterns printed on paper and transmits strokes to a receiver. In principle, it converts any handwriting to digital in real time. In practice, it required proprietary paper (expensive), an expensive pen ($100+), and a companion receiver — all of which had to work simultaneously. Despite $100M+ in investment and 300+ patents, it never achieved consumer adoption. It is literally in the Museum of Failure. The lesson: any solution that requires all components to be in place simultaneously (special paper + special pen + special receiver) will fail on the component that runs out first.

**Livescribe smartpen** — niche survival of the Anoto idea.
Livescribe licensed Anoto's dot-pattern technology, simplified it to pen + special paper notebook + app, and found a real niche: college students recording lectures while handwriting notes. It is alive and actively developed in 2025. But it never crossed into K-5 classrooms — the pen costs $70-100, the special paper costs money, and young children lose hardware. The pattern that worked: audio-linked handwriting, where tapping a word replays what was being said when it was written. Possibly relevant for our AI chat transcript feature (linking student voice input to the part of the worksheet they were asking about) but not for the core scan pipeline.

**Rocketbook** — erasable paper + cloud sync.
Erasable notebooks that sync via phone camera to Google Drive, Notion, Slack, etc. A neat product but not a learning tool — it is a note-taking workflow tool for adults. What is interesting: it proves that "paper that talks to the cloud" is a consumer-palatable idea when it does not require special hardware (any phone camera works). The product is active and expanded its lineup in 2024.

### The Chinese camera-grading apps (most relevant technical analogs)

**Xiaoyuan Kousuan (小猿口算, Yuanfudao)** — the closest analog to our scan-and-grade step.
Students hold a completed arithmetic worksheet up to a phone camera. The app grades every problem in under 3 seconds, marks wrong answers with a red X, and explains mistakes. 70 million problems checked per day at peak. Built for K-5. Bilingual (Chinese + English arithmetic is the same). Tencent-backed. This is exactly what we want our scan-and-evaluate step to look like from the user's perspective. The key: the camera does not need a fancy scanner — it needs a stable mount, decent lighting, and a model trained on student handwriting. They achieved this without Gradescope-style template alignment by training on massive volumes of K-5 arithmetic papers. We probably cannot replicate that training data, which is why the Gradescope fixed-template approach is more appropriate for our scale.

**Zuoyebang (作业帮)** — photo homework search at scale.
Students photograph a homework problem and get the answer with steps from a 1.9 billion problem database, plus live tutoring. 400M registered users. The product validated that a phone camera + handwritten problem → instant AI response is a workflow students will adopt en masse. It was gutted by Chinese government regulation in 2021 (the "double reduction" policy shut down ~85-95% of online tutoring operations). The regulatory lesson for us: build a tool that is clearly formative and teacher-transparent, not a homework-answer dispenser. The design principle in CLAUDE.md ("NOT a homework-help chatbot") is not just pedagogical — it is regulatory risk management.

### Why the failures failed: the three root causes

1. **Proprietary paper as a dependency.** Anoto, LeapFrog Tag: the moment the special paper is unavailable or too expensive, the product dies. Any paper in our system must print from any standard printer on any standard paper.

2. **Hardware that students lose or break.** Livescribe pen, Anoto pen, early Osmo: a $70-100 device in the hands of a 7-year-old in a shared space is gone within a month. Our hardware budget is: a shared kiosk camera and a shared printer. No student-held hardware.

3. **Feedback loop that ends at "graded."** Kumon, Scantron, most OMR systems: they tell you what is wrong but not what to do next. The whole point of our system is that the scan triggers an adaptive state update and a new task — not just a score.

### What the successes have in common

- **The paper is the learning artifact; the camera is the submission mechanism.** Students do not interact with screens to complete tasks. They interact with screens to check in, receive their printed task, and review feedback. The physical act of writing on paper is preserved.
- **Fixed-template alignment makes OCR tractable.** Every worksheet looks the same structurally (QR header, fixed answer regions). The system does not need to understand arbitrary handwriting — it needs to understand handwriting in a known location with a known expected answer type.
- **Sub-30-second scan-to-feedback.** Xiaoyuan Kousuan's 3-second feedback on arithmetic is the gold standard. Our target of under 30 seconds (from CLAUDE.md open question #4) is achievable and the right ceiling — past that, students disengage.
- **No student-held hardware.** Every successful product in this space either uses the phone the student already has (Photomath, Xiaoyuan) or uses shared institutional hardware (Gradescope, Scantron). We use shared institutional hardware. This is consistent with what works.

### Implications for our worksheet and scan design

| Design decision | What the evidence says |
|---|---|
| Paper stock | Standard 20lb laser paper, any printer. Never require special paper. |
| Scan hardware | A fixed-mount USB or PoE camera (like a document camera) with consistent lighting beats a handheld phone in a kiosk context. Ring light or diffused overhead. |
| Template alignment | QR code in header + three fiducial corner marks. Answer regions are fixed coordinates registered to the template. Gradescope's pattern, implemented for our worksheet dimensions. |
| Answer region size | Minimum 8–10mm for any bubble/box. For free-response math, allocate a fixed region per sub-problem large enough that a 7-year-old's handwriting fits. |
| OCR approach | Multimodal LLM (Claude / Gemini) on the cropped answer region image is simpler and more accurate than running a separate OCR pipeline for K-5 at our scale. The 97–99% transcription accuracy cited in published studies applies to clean cropped regions — which the fixed-template approach gives us. Pix2Text as local fallback if API latency is too high. |
| Handwriting OCR accuracy ceiling | Expect 90–95% on legible K-5 print handwriting, lower on messier work. The evaluation prompt must handle transcription uncertainty — "I think this says X, but the handwriting is unclear, so I'm marking it for teacher review." |
| Feedback latency target | Under 30 seconds from scan to printed/displayed feedback. Under 10 seconds is achievable for arithmetic; under 30 is the ceiling for multi-step problems requiring LLM evaluation. |
| Proprietary paper risk | Zero. Every worksheet is generated and printed on-demand from a standard template. The school needs only paper, a printer, and ink. |

## Open source to leverage

### Student modeling
- **pyBKT** (Berkeley CAHLR) — Python implementation of Bayesian Knowledge Tracing and variants. Battle-tested, has a `Roster` abstraction for tracking many students × many skills, well-documented. Use this for v1.
- **pyKT** — benchmark library for deep knowledge tracing models (DKT, DKT+, DKVMN, AKT, SAKT, and others). Use later when you have data to fit deeper models.
- **OATutor** (CAHLR) — full open-source adaptive tutoring system, ReactJS + Firebase, BKT-driven problem selection. Even if you don't fork it, *read it* — it's the reference architecture for an ITS shipped in 2023, with curriculum content and CHI '23 paper attached.
- **CTAT/Tutorshop** — older but still relevant ITS authoring environment from CMU. Plug-in student modeling architecture. Useful for understanding how authoring tools have historically structured the problem.

### OCR / handwriting recognition
- **Pix2Text** — open-source Python alternative to Mathpix. Recognizes layouts, tables, math formulas (LaTeX), text in 80+ languages including Simplified Chinese. Free for the cheap path.
- **Mathpix API** — paid but accurate. Reach for it if Pix2Text quality isn't sufficient on student handwriting.
- **Multimodal LLM direct** — Claude Sonnet 4.6, Gemini 2.5, GPT-4o all transcribe handwritten student work at 97–99% accuracy in published studies. Often the simplest path: skip OCR as a separate step, send the cropped answer region image directly to the LLM with a "transcribe then evaluate" prompt. Watch for hallucination on illegible text — the studies report 2-4% hallucination rates.
- **MathWriting dataset** (Google DeepMind) — 230K human-written + 400K synthetic handwritten math expressions with LaTeX labels. Useful if you ever want to fine-tune your own HME model. Probably overkill for v1.
- **TAMER, Uni-MuMER** — recent SOTA HME recognition research. Bookmark for v3.

### Knowledge graph + KC generation
- **KCluster** (2025 paper) — LLM-based clustering for automated KC discovery from question text. Use to bootstrap your skill tree from existing BHCS worksheet archives.
- **Automated KC generation** (UMass/NCSU 2025 paper) — fully automated pipeline for KC generation and tagging using LLMs, evaluated on coding problems but the method generalizes. Read before manually authoring KCs.
- **Synergizing Knowledge Graphs and LLMs (KG-CQ)** — pattern for grounding LLM responses in a course-specific Neo4j graph. Useful reference for the chat-with-AI-during-task feature, where we want the AI grounded in the student's curriculum, not the open internet.

### Curriculum content (free)
- **Core Knowledge Sequence** (Core Knowledge Foundation, 2023 edition) — preschool–grade 8, content-specific curriculum guidelines across language arts, history, math, science, fine arts. The 2023 edition is current. Use as a seed taxonomy.
- **Common Core State Standards** (math + ELA) — required reference for any US-deployed K-12 product.
- **OER Commons, OpenStax, IXL skill plans** (publicly listed) — for content references when seeding the KC graph.

## Patterns worth stealing

These are specific design moves from existing products that map directly to our problem.

1. **Gradescope's fixed-template overlay.** Every worksheet uses the same layout. The scanner aligns the submission to the blank template, extracts the answer-region diff. This is how they make handwriting OCR robust. Copy this; do not invent your own scanning approach.

2. **Aimchess's per-aspect radar.** Aimchess analyzes every move across six core dimensions (tactics, calculation, openings, endgames, conversion, resourcefulness) and shows the player a personalized radar chart benchmarked against same-rated peers. This is the right model for our radar — not just "math: 70%" but `arithmetic: 70%`, `word problems: 45%`, `fractions: 30%`, with peer benchmarks.

3. **Chess.com Game Review's narrative arc.** Post-game reviews don't list every move — they identify a turning point, name the kind of mistake (blunder vs inaccuracy vs missed brilliancy), and suggest what to study. Our session reports should follow the same shape: "you did well on multiplication facts; the place where things slipped was carrying in two-digit addition; here's tomorrow's task."

4. **Khanmigo's Socratic refusal-to-answer.** When a student asks "what's the answer?", Khanmigo asks "what have you tried?" instead. This is the right default for our voice/keyboard chat, even though it will frustrate some students. Document the choice; the alternative is a homework-doer.

5. **Aimchess's "lessons generated from your games."** The lessons aren't generic — they're built from the player's actual games. Our worksheets should be built from the student's actual error patterns. Don't prefab a curriculum and serve it; generate every worksheet on demand from the student's KC frontier and recent mistakes.

6. **QR-coded paper.** Both Akindi and academic literature converge on this: every printable artifact gets a unique QR/DataMatrix code in the header. This is what lets the system know which student, which task, which version on scan-back. Universal pattern; do not deviate.

7. **Squirrel AI's closed-loop philosophy.** Assessment → practice → learning → testing → teaching, in one device. Their explicit articulation of this loop is worth lifting wholesale into our internal vocabulary.

## What not to reinvent

If you find yourself building any of the below, stop and use the existing thing:

| If you're building...                                        | Use instead                                                               |
|--------------------------------------------------------------|---------------------------------------------------------------------------|
| A Bayesian student-mastery model                             | pyBKT                                                                     |
| A deep-learning student-mastery model                        | pyKT (only after you have data)                                           |
| Handwritten-math OCR                                         | Pix2Text (free) or Mathpix API (paid) — or skip and use Claude/Gemini    |
| A general handwritten OCR engine                             | Same as above                                                             |
| A scanned-worksheet template alignment system                | Gradescope's pattern — overlay submission on blank template, diff regions|
| A skill graph data model                                     | Standard Q-matrix in Postgres tables                                      |
| A KC discovery pipeline                                      | KCluster / automated KC generation papers                                 |
| A K-8 content taxonomy                                       | Core Knowledge Sequence + Common Core                                     |
| A speech-to-text engine                                      | Whisper                                                                   |
| A text-to-speech voice                                       | ElevenLabs or OpenAI TTS                                                  |
| A rubric-grading LLM prompt                                  | Use the published patterns from the Kortemeyer (calculus) and Bioinformatics-grading papers — both publish their full prompts |
| An ITS authoring system                                      | OATutor (or just don't author — let LLMs generate)                        |

## Open questions where research isn't settled

These are spaces where you'll need to experiment, because no one has a great answer yet:

- **How accurate is multimodal LLM grading on K-5 student handwriting specifically?** Existing studies use college-level work with cleaner handwriting. Plan a small validation study: have a teacher grade 100 scanned BHCS worksheets, compare to Claude/Gemini/GPT-4o output, measure agreement. Until you do this, treat AI grades as suggestions for the human, not facts.
- **How does paper-based interaction affect engagement vs screen-based?** Squirrel AI has not published on this. You'll generate the data.
- **How fine-grained should KCs be?** Squirrel AI's "tens of thousands" is too many for one school's bandwidth to author or maintain. Probably ~200-500 is the right size for K-5 across three subjects. Iterate from coarse to fine as you see students hit ceilings.
- **How much can the AI actually personalize without enough data?** BKT needs ~5-10 attempts per skill to fit reasonably. The cold start problem is real for the first 6 weeks. Plan a placement test that's good enough to seed initial estimates.

## References

(Selected — full set in the conversation that produced this doc.)

- Pardos et al., *pyBKT: An Accessible Python Library of Bayesian Knowledge Tracing Models*, EDM 2021
- Pardos et al., *OATutor: An Open-source Adaptive Tutoring System*, CHI 2023
- Kortemeyer et al., *AI Grading Assistance for Handwritten Calculus*, 2025
- Multiple recent papers on LLM-based KC generation and clustering (UMass, CMU, Peking)
- Squirrel AI public materials and TIME 100 Most Influential Companies 2026 entry
- Aimchess + Chess.com product pages for radar/coaching pattern reference
- Gradescope public docs for the AI-assisted handwritten grading pattern

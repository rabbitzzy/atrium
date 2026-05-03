# Design Patterns Worth Stealing

> Part of the market research for Atrium. See also: [competitive-landscape.md](./competitive-landscape.md), [open-source-stack.md](./open-source-stack.md).

These are specific design moves from existing products that map directly to our problem.

1. **Gradescope's fixed-template overlay.** Every worksheet uses the same layout. The scanner aligns the submission to the blank template, extracts the answer-region diff. This is how they make handwriting OCR robust. Copy this; do not invent your own scanning approach.

2. **Aimchess's per-aspect radar.** Aimchess analyzes every move across six core dimensions (tactics, calculation, openings, endgames, conversion, resourcefulness) and shows the player a personalized radar chart benchmarked against same-rated peers. This is the right model for our radar — not just "math: 70%" but `arithmetic: 70%`, `word problems: 45%`, `fractions: 30%`, with peer benchmarks.

3. **Chess.com Game Review's narrative arc.** Post-game reviews don't list every move — they identify a turning point, name the kind of mistake (blunder vs inaccuracy vs missed brilliancy), and suggest what to study. Our session reports should follow the same shape: "you did well on multiplication facts; the place where things slipped was carrying in two-digit addition; here's tomorrow's task."

4. **Khanmigo's Socratic refusal-to-answer.** When a student asks "what's the answer?", Khanmigo asks "what have you tried?" instead. This is the right default for our voice/keyboard chat, even though it will frustrate some students. Document the choice; the alternative is a homework-doer.

5. **Aimchess's "lessons generated from your games."** The lessons aren't generic — they're built from the player's actual games. Our worksheets should be built from the student's actual error patterns. Don't prefab a curriculum and serve it; generate every worksheet on demand from the student's KC frontier and recent mistakes.

6. **QR-coded paper.** Both Akindi and academic literature converge on this: every printable artifact gets a unique QR/DataMatrix code in the header. This is what lets the system know which student, which task, which version on scan-back. Universal pattern; do not deviate.

7. **Squirrel AI's closed-loop philosophy.** Assessment → practice → learning → testing → teaching, in one device. Their explicit articulation of this loop is worth lifting wholesale into our internal vocabulary.

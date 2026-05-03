# Open Research Questions

> Part of the market research for Atrium. These are spaces where the research isn't settled — you'll need to experiment.

## What isn't settled yet

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

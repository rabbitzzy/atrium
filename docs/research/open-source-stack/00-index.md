# Open Source Stack — Index

Libraries, datasets, and free content sources that Atrium should use rather than reinvent. Each subcategory has its own file.

- [student-modeling.md](./student-modeling.md) — pyBKT, pyKT, OATutor, CTAT
- [ocr.md](./ocr.md) — Pix2Text, Mathpix, multimodal LLM direct, MathWriting dataset
- [kc-generation.md](./kc-generation.md) — KCluster, UMass/NCSU pipeline, KG-CQ chat grounding
- [curriculum-content.md](./curriculum-content.md) — Common Core, Core Knowledge Sequence, Chinese national standards, Hanzi lists, seed KC structure

## What not to reinvent

If you find yourself building any of the below, stop and use the existing thing:

| If you're building...                             | Use instead                                                                   |
|---------------------------------------------------|-------------------------------------------------------------------------------|
| A Bayesian student-mastery model                  | pyBKT                                                                         |
| A deep-learning student-mastery model             | pyKT (only after you have ≥10K interaction logs)                              |
| Handwritten-math OCR                              | Pix2Text (free) or Mathpix API (paid) — or skip and use Claude/Gemini direct |
| A general handwritten OCR engine                  | Same as above                                                                 |
| A scanned-worksheet template alignment system     | Gradescope's pattern — overlay submission on blank template, diff regions     |
| A skill graph data model                          | Standard Q-matrix in Postgres tables                                          |
| A KC discovery pipeline                           | KCluster / automated KC generation papers                                     |
| A K-8 content taxonomy                            | Core Knowledge Sequence + Common Core                                         |
| A Chinese character scope/sequence                | Hanzi frequency lists (HSK or modern corpus)                                  |
| A speech-to-text engine                           | Whisper                                                                       |
| A text-to-speech voice                            | ElevenLabs or OpenAI TTS                                                      |
| A rubric-grading LLM prompt                       | Kortemeyer (calculus) and Bioinformatics-grading papers — both publish prompts|
| An ITS authoring system                           | OATutor (or just don't author — let LLMs generate)                            |

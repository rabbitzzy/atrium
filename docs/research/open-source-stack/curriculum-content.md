# Curriculum Content — Free Sources and Seeding Strategy

Atrium does not own a curriculum. It borrows KC taxonomies from established free sources and lets the LLM generate problems on demand. This doc maps those sources to the BHCS context and proposes a 30-KC seed structure for the pilot.

---

## Common Core State Standards (math + ELA)

**Source:** corestandards.org — free, public domain  
**Scope:** K–12 math and English Language Arts / Literacy  
**Why it matters:** Any US school product assessed by parents or administrators will be evaluated against Common Core. Aligning KC names to CCSS standard codes (`3.NF.A.1`) makes teacher trust and external audits easier.

### Math domains by grade band (K–5)

| Domain | Grade band | Key KCs to seed |
|--------|-----------|-----------------|
| Counting & Cardinality | K | counting sequences, one-to-one correspondence, comparing quantities |
| Operations in Base Ten | K–5 | place value, multi-digit addition/subtraction/multiplication/division, rounding |
| Operations & Algebraic Thinking | K–5 | addition/subtraction as inverse, multiplication as repeated addition, simple equations |
| Number & Operations — Fractions | 3–5 | unit fractions, equivalent fractions, comparing fractions, fraction arithmetic |
| Measurement & Data | K–5 | length/weight/volume measurement, bar graphs, line plots, area/perimeter |
| Geometry | K–5 | 2D shapes, symmetry, coordinate plane (grade 5) |

**Pilot priority:** Operations in Base Ten (K–3) and Fractions (3–5) are the highest-value math domains for the BHCS pilot. They have the clearest KC decompositions and the largest stock of existing BHCS worksheet material.

### ELA strands by grade band (K–5)

| Strand | Scope |
|--------|-------|
| Reading: Literature | story elements, theme, character motivation, compare texts |
| Reading: Informational Text | main idea, text structure, evidence from text, vocab in context |
| Writing | opinion, informational, narrative — at grade-appropriate length |
| Language | grammar, conventions, academic vocabulary, figurative language |
| Speaking & Listening | retelling, presentation, discussion skills |

**Pilot priority:** Reading: Literature + Informational Text for English literacy. Most other strands require longer-form production that is hard to assess from a single worksheet scan.

---

## Core Knowledge Sequence (2023 edition)

**Source:** coreknowledge.org — free download  
**Scope:** Preschool–Grade 8, content-specific (not just skills — what *knowledge* at each grade)  
**Why it matters:** Common Core describes *skills* (can compare fractions); Core Knowledge describes *content* (knows that ancient Egypt built pyramids). For a school like BHCS with a rich cultural curriculum, Core Knowledge fills the gap between skill-based KC tracking and content-based learning.

### What it covers that Common Core doesn't

- History and geography content (Grade 1: American history + world geography basics)
- Science topics per grade (Grade 2: insects and plants; Grade 3: the human body)
- Fine arts and music vocabulary
- **Literary content** — specific stories, poems, myths that students at each grade should know

### How to use it for BHCS KC seeding

Core Knowledge is best used as a *naming and scoping* reference, not a strict taxonomy:
1. Look up what content a Grade 3 student should know (e.g. "fractions, ancient Egypt, life cycles").
2. Use that content as the *context* for worksheet problems — word problems about the Nile River test fraction skills; reading passages about monarch butterflies test reading comprehension skills.
3. The KC being assessed is still a Common Core skill KC; Core Knowledge supplies the content wrapper.

This is the "interest-themed problem generation" idea from `impl/exhibits.md` at the curriculum level: content knowledge is the soil, skill mastery is the harvest.

---

## Chinese Curriculum Standards

BHCS students are learning Mandarin Chinese. The skill tree needs a Chinese language branch that maps to recognized standards — not just Pinyin and stroke counts.

### PRC National Curriculum Standards (义务教育语文课程标准)

**Source:** Ministry of Education, PRC — 2022 revision  
**Scope:** Chinese Language Arts, Grades 1–9

The 2022 revision restructured Chinese language learning around three core competencies:
1. **语言运用 (Language Use)** — listening, speaking, reading, writing as integrated practice
2. **思维能力 (Thinking Ability)** — inference, imagination, critical and creative thinking through language
3. **文化自信 (Cultural Confidence)** — classical literature, cultural heritage, Chinese identity

**Practical KC mapping from the standards:**

| Standard area | Example KCs |
|---|---|
| Phonetics | Pinyin recognition, tone discrimination, syllable structure |
| Characters | Stroke order for new characters, radical identification, character-word mapping |
| Vocabulary | Grade-level word list recognition, word meaning in context, antonym/synonym |
| Reading | Sentence comprehension, passage main idea, inference, text-to-self connection |
| Writing | Character copying accuracy, sentence composition, short paragraph |
| Oral | Retelling a story, describing an image, dialogue practice |

The Ministry publishes a required character list per grade. **Grade 1–2:** 300 characters (recognition), 100 characters (writing). **Grade 3–4:** 600 additional. **Grade 5–6:** 500 additional. These are hard scope boundaries for the KC graph's Chinese character branch.

### HSK (汉语水平考试) — for non-heritage learners

**Source:** Hanban/Chinese International Education Foundation — free vocabulary lists  
**Scope:** 6 levels (HSK 1–6), roughly aligns with CEFR A1–C2

HSK is designed for learners of Mandarin as a second language, not native/heritage speakers. Most BHCS students are heritage learners (Mandarin at home, English at school) — they are closer to the PRC national standards than HSK in terms of cultural knowledge and listening comprehension, but closer to HSK in terms of reading and writing formality.

**Pragmatic approach:** use HSK vocabulary lists as a *floor* for reading/writing KCs (if a student can't recognize HSK 2 words, they are below grade level for heritage literacy), and PRC national standards as the *ceiling* for oral and cultural KCs.

| Level | Characters | Approximate BHCS grade equivalent |
|-------|------------|-----------------------------------|
| HSK 1 | 150 words | Pre-K / Kindergarten |
| HSK 2 | 300 words | Grade 1–2 |
| HSK 3 | 600 words | Grade 2–3 |
| HSK 4 | 1,200 words | Grade 4–5 |
| HSK 5 | 2,500 words | Middle school |

### Hanzi frequency lists

**Sources:**
- **Modern Chinese Frequency Dictionary** (Junda corpus) — character frequency from ~10M word modern corpus. Free download; available as CSV.
- **Da Lu Textbook Character Lists** (人教版 PEP) — exact characters introduced per semester in mainland PRC textbooks. Highly structured and grade-aligned.
- **TOCFL** (Taiwan, Chinese as a second language) — alternative to HSK; useful if your teachers prefer Taiwan-standard Mandarin.

**For KC seeding:** the PEP textbook character lists are the most directly usable. They tell you exactly which 15–20 characters are introduced per week in mainland Grade 1. Map these directly to KC nodes in the `lang/zh/characters/grade-1` branch.

---

## Other Free Content Sources

### OER Commons

**Source:** oercommons.org — open educational resources, searchable by grade/subject/standard  
Useful for finding existing worksheets to feed into the KCluster pipeline. Search for "Common Core Grade 3 fractions worksheet" and you'll find hundreds of CC-licensed items. Use them as problem generation seeds, not as final content.

### OpenStax

**Source:** openstax.org — free textbooks, K-12 and college  
Less directly useful for K-5 worksheets. More useful as a reference for how a concept is explained at grade level — paste a section into the worksheet generator as context for "explain this concept at a Grade 3 reading level."

### IXL Skill Plans (publicly listed)

IXL publishes their skill plans for all grades/standards on their public website without requiring login. These are hierarchical trees of skills with names, grade assignments, and standard alignments. Not CC-licensed, but the *structure* (how they decompose a domain into skills) is freely observable and gives a useful sanity check on your KC taxonomy.

---

## Recommended 30-KC Seed Structure for the Pilot

This is a concrete starting point — 10 KCs per subject branch — sufficient for a 6-week pilot with BHCS students in Grades 1–4. Expand by running KCluster on BHCS worksheet archives once you have them digitized.

### Math branch (10 KCs)

| KC ID | Name | CCSS reference | Target grades |
|-------|------|----------------|---------------|
| `math/base-ten/place-value-hundreds` | Place value: hundreds, tens, ones | 2.NBT.A.1 | 2–3 |
| `math/base-ten/add-3-digit` | Addition of 3-digit numbers with regrouping | 2.NBT.B.7 | 2–3 |
| `math/base-ten/subtract-3-digit` | Subtraction with borrowing | 2.NBT.B.7 | 2–3 |
| `math/ops/multiplication-facts` | Multiplication facts 0–10 | 3.OA.C.7 | 3 |
| `math/ops/division-as-inverse` | Division as inverse of multiplication | 3.OA.B.6 | 3–4 |
| `math/ops/word-problems-1-step` | One-step word problems (any operation) | 3.OA.D.8 | 3–4 |
| `math/fractions/unit-fraction` | Unit fractions: 1/2, 1/3, 1/4, 1/6, 1/8 | 3.NF.A.1 | 3 |
| `math/fractions/equivalent` | Equivalent fractions using visual models | 3.NF.A.3 | 3–4 |
| `math/fractions/compare` | Comparing fractions with same numerator or denominator | 3.NF.A.3d | 3–4 |
| `math/measurement/area-perimeter` | Area and perimeter of rectangles | 3.MD.C.7 | 3–4 |

### English Language Arts branch (10 KCs)

| KC ID | Name | CCSS reference | Target grades |
|-------|------|----------------|---------------|
| `lang/en/phonics/cvc-words` | CVC word decoding (consonant-vowel-consonant) | RF.1.3b | 1 |
| `lang/en/phonics/blends-digraphs` | Initial blends and digraphs (bl-, sh-, th-) | RF.1.3c | 1–2 |
| `lang/en/reading/main-idea` | Identify main idea of a paragraph | RI.2.2 | 2–3 |
| `lang/en/reading/story-elements` | Story elements: character, setting, problem, solution | RL.2.5 | 2–3 |
| `lang/en/reading/inference` | Draw inference from text evidence | RL.3.1 | 3–4 |
| `lang/en/vocab/context-clues` | Use context clues to determine word meaning | L.3.4a | 3–4 |
| `lang/en/writing/complete-sentence` | Write a complete sentence with subject and predicate | L.1.1j | 1–2 |
| `lang/en/writing/paragraph-topic` | Write a paragraph with topic sentence and 2 supporting details | W.3.2 | 3–4 |
| `lang/en/grammar/noun-verb-agreement` | Subject-verb agreement in simple sentences | L.1.1c | 1–2 |
| `lang/en/grammar/past-tense` | Regular and irregular past tense verbs | L.2.1d | 2–3 |

### Chinese Language branch (10 KCs)

| KC ID | Name | PRC standard / HSK | Target grades |
|-------|------|--------------------|---------------|
| `lang/zh/pinyin/tones` | Four tones: recognition and production | Grade 1 phonetics | 1 |
| `lang/zh/pinyin/initials-finals` | All initials and finals, spelling rules | Grade 1 phonetics | 1 |
| `lang/zh/chars/grade1-set1` | First 50 characters from PEP Grade 1 semester 1 | PEP Grade 1 | 1 |
| `lang/zh/chars/grade1-set2` | Characters 51–150 from PEP Grade 1 | PEP Grade 1 | 1–2 |
| `lang/zh/chars/grade2-set1` | Characters 151–300 from PEP Grade 1–2 | PEP Grade 2 | 2 |
| `lang/zh/radicals/water-fire-wood` | Recognize and name 水木火土金 radicals and their derivatives | Grade 2 character analysis | 2–3 |
| `lang/zh/reading/sentence-meaning` | Understand a simple 2–3 clause sentence in Chinese | HSK 2 reading | 2–3 |
| `lang/zh/reading/passage-main-idea` | Identify main idea of a short Chinese paragraph | HSK 3 reading / Grade 3 | 3–4 |
| `lang/zh/writing/copy-accuracy` | Copy a Grade 2 character with correct stroke order | PEP Grade 2 writing | 2 |
| `lang/zh/writing/sentence-compose` | Write a simple sentence about a given image (2–3 clauses) | Grade 3 writing | 3 |

---

## Seeding workflow for the pilot

1. **Pull 100–200 existing BHCS worksheets** (scanned or PDF). Sort by subject and approximate grade level.
2. **Extract questions** (OCR or manual transcription of the prompt text, not student answers).
3. **Run KCluster** on the extracted questions. Review the candidate clusters against the 30-KC seed set above — merge clusters that correspond to the same seed KC, flag any clusters that reveal a skill you missed.
4. **Load seed KCs into `kcs` table** with `bkt_p_l0` defaults from the literature.
5. **Generate 3 example problems per KC** by prompting Claude: "Generate 3 problems at difficulty [1/3/5] that assess [KC description] for a Grade [N] student. Bilingual EN/ZH."
6. **Teacher review pass**: one teacher, 30–60 minutes, reviewing KC names, definitions, and example problems. Their feedback on the first 30 is far more valuable than author-by-committee.

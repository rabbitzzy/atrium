# Student Modeling — Open Source Libraries

The student model is the engine that decides what a student knows and what they should practice next. Don't build this from scratch. Two decades of research exists in easily installable Python packages.

## pyBKT — use this for v1

**Repo:** `CAHLR/pyBKT` (Berkeley)  
**Install:** `pip install pyBKT`

Bayesian Knowledge Tracing with four parameters per KC:

| Parameter | Symbol | Meaning | Typical default |
|-----------|--------|---------|-----------------|
| Prior probability of knowing | p(L₀) | What fraction of students know this KC before any practice | 0.1–0.4 |
| Learning rate | p(T) | Probability of transitioning from unmastered to mastered after a practice opportunity | 0.1–0.3 |
| Slip rate | p(S) | Probability of a wrong answer even if the student knows the KC | 0.05–0.15 |
| Guess rate | p(G) | Probability of a right answer even if the student does not know the KC | 0.1–0.25 |

### Key API surface

```python
from pyBKT.models import Model

model = Model(seed=42)

# Fit on historical data (DataFrame with columns: user_id, skill_name, correct)
model.fit(data=df)

# Predict mastery probability for a student after a sequence of attempts
model.predict(data=student_df)  # returns p(mastery) per row

# Roster abstraction: track many students × many skills
roster = model.roster(data=df)
roster['mastery_probs']  # Dict[student_id, Dict[skill_name, float]]
```

### Starting with defaults

For the first 6-week pilot you will not have enough data to fit BKT parameters from scratch. Start with literature defaults (above) and override per-KC as you accumulate data:

- After ~50 attempts on a KC, run `model.fit()` on just that KC's data and update parameters.
- After ~500 attempts per KC, fit the full model jointly.

### What pyBKT does not do

- No sequence effects (it treats each attempt as independent given mastery state). That is fine for v1.
- No forgetting model. Students who haven't practiced a KC in months may have decayed — BKT won't capture this. Add a time-decay heuristic (multiply mastery prob by 0.9 per semester of inactivity) manually if needed.
- No multi-KC items. A word problem touching both arithmetic and reading comprehension requires you to split credit manually across KCs.

---

## pyKT — upgrade path when you have data

**Repo:** `pyKT-benchmark/pyKT`  
**Install:** `pip install pykt-toolkit`

Benchmark library for deep knowledge tracing. Includes: DKT, DKT+, DKVMN, AKT, SAKT, SAINT, and more. All models share a unified training/evaluation API.

**When to switch from pyBKT to pyKT:**
- You have ≥10K interaction logs (student × KC × correct × timestamp)
- BKT accuracy on held-out data plateaus below an acceptable threshold
- You need sequence modeling (DKT captures recency and ordering; BKT does not)

**Practical note:** DKT in particular requires a fixed KC vocabulary at training time. If you're still adding KCs to the Blueprint, pyBKT is more flexible. Freeze the KC graph before training DKT.

---

## OATutor — read it, don't fork it

**Repo:** `CAHLR/OATutor`  
**Paper:** Pardos et al., CHI 2023

A complete open-source Intelligent Tutoring System: ReactJS frontend, Firebase backend, BKT-driven problem selection, full algebra curriculum. The CHI 2023 paper reports statistically significant learning gains in a randomized trial.

**Why read it even if you don't fork:**
- The `HintFactory` and `BKTBrain` modules show exactly how BKT state maps to hint policy and next-problem selection in production code.
- The curriculum schema (skills → problems → hints, encoded in JSON) is a clean reference for how to structure task templates.
- The `Mastery` threshold logic (stop assigning a KC when p(mastery) > 0.95 for N consecutive correct) is the right default to copy.

**What it doesn't have:** paper artifacts, scanner integration, bilingual support, parent portal, or kiosk UX. Don't try to adapt it — use it as a reading reference.

---

## CTAT / Tutorshop — historical reference

**Tool:** Cognitive Tutor Authoring Tools (CMU HCII)

The oldest serious ITS authoring environment. Generates step-level hints from a worked-solution graph (the "Behavior Graph"). The student model is pluggable — early versions used the original BKT implementation from 1994.

**Relevance for Atrium:**
- The Behavior Graph concept (map every possible correct and incorrect step in a problem's solution space, annotate each edge with a KC and a hint) is the gold standard for hand-authored tutors. Our rubric prompts are a looser version of this.
- The Phase 2 authoring surface (`docs/pedagogy/teacher-direction.md`) — where a teacher defines a KC, describes mastery, and seeds example problems — is spiritually descended from CTAT authoring. Reading CTAT's design rationale will give vocabulary for that feature.
- Don't implement CTAT's approach for v1 — step-level behavior graphs are too labor-intensive to author for a K-5 generalist system. Use it as a conceptual reference only.

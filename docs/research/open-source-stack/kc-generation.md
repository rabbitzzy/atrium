# KC Generation and Knowledge Graph

The skill tree does not need to be authored by hand from scratch. Two 2025 papers describe LLM-based pipelines that can bootstrap a KC graph from existing content (worksheets, textbooks, problem sets). Use them.

## Why not author KCs manually from scratch

Hand-authoring a K-5 KC graph is feasible for ~30–50 KCs (the pilot scope). But it gets expensive fast:
- Each KC needs a name, definition, prerequisite edges, difficulty calibration, and 2–3 example problems to seed the generator.
- KC relationships (which skills unlock which) require pedagogical expertise per domain.
- Manual KCs tend to be too coarse ("fractions") or inconsistently granular across subjects.

The research solution: feed existing BHCS worksheets and curriculum docs into an LLM clustering pipeline, get a first-draft KC graph out, then have a teacher review and refine rather than author from zero.

---

## KCluster (2025)

**Paper:** "Automatic Knowledge Component Discovery via LLM Clustering" (2025)

An LLM-based pipeline for automated KC discovery from question text. The key insight: questions that require the same underlying skill will generate similar LLM embeddings; cluster those embeddings to surface implicit KCs.

### How it works

1. **Collect questions** — any existing worksheet problems, textbook exercises, BHCS archive items.
2. **Generate embeddings** — embed each question with a text embedding model (OpenAI `text-embedding-3-small`, Voyage, or similar).
3. **Cluster** — HDBSCAN or k-means on the embeddings. Each cluster = a candidate KC.
4. **Name clusters** — prompt an LLM: "These questions all test the same skill. Name the skill in 3–5 words and describe what mastery looks like."
5. **Build prerequisite graph** — ask the LLM: "For each KC, list the KCs a student must already know to attempt it."
6. **Teacher review** — present the draft graph for approval, merge/split/rename as needed.

### Expected output for BHCS

If you run KCluster on ~500 existing BHCS worksheets (math + Chinese + English):
- Expect 50–150 candidate KCs before teacher pruning
- Expect ~60% precision on prerequisite edges (the LLM overconnects; prune aggressively)
- Expect clean cluster names for arithmetic and Chinese character categories; noisier for reading comprehension

### Practical notes

- Feed questions in both languages. Embedding models handle bilingual text; the LLM naming step may need a prompt instruction: "Name in English, then provide the Chinese term."
- Deduplicate questions before embedding — near-duplicate worksheets will inflate certain clusters.
- Run at the *problem level*, not the worksheet level. One worksheet may touch 3–4 KCs; embedding the whole page loses that signal.

---

## Automated KC Generation Pipeline (UMass/NCSU 2025)

**Paper:** "Automated Knowledge Component Generation and Tagging Using Large Language Models" (UMass/NCSU, 2025)

A more structured pipeline than KCluster: instead of discovering KCs from questions, it *generates* KCs top-down from a learning objective, then tags existing questions.

### Steps

1. **Input:** a subject area + grade level + curriculum standard (e.g. "Common Core Grade 3 Number and Operations in Base Ten")
2. **Decompose:** LLM decomposes the standard into atomic sub-skills (KCs), asking "what does a student need to be able to do independently to demonstrate mastery of this standard?"
3. **Generate rubrics:** for each KC, generate a mastery rubric ("mastered if: student can... without scaffolding") and 3 example problems at each of difficulty 1, 3, 5.
4. **Tag existing questions:** for each existing question, ask the LLM which KC(s) it primarily assesses. Output: Q-matrix.
5. **Validate:** check that no two generated KCs have identical rubrics; check that prerequisite edges are consistent (no cycles, no unreachable nodes).

### How to adapt for BHCS

The paper was evaluated on coding problems (Python functions as the "subject"). For BHCS:
- Replace the standard decomposition prompt with: "Given this BHCS curriculum topic [X], list the atomic skills a K-5 student must master. Use the Core Knowledge Sequence and Common Core as guardrails."
- For Chinese, replace Common Core with the PRC national curriculum standards (see `curriculum-content.md`).
- The rubric generation step is the most valuable part — it produces the structured prompts that the evaluator service sends to Claude for grading.

---

## KG-CQ — Grounding Chat in the Curriculum

**Paper:** "Synergizing Knowledge Graphs and LLMs for Course Question Generation" (KG-CQ)

A pattern for making an LLM's chat responses *curriculum-aware* rather than drawing from the open internet. The mechanism: store the skill graph in a structured format (the paper uses Neo4j; Postgres works fine for our scale), query the relevant KCs before each chat turn, and inject them as context.

### Applied to Atrium's Docent chat

When a student asks "why do I need a common denominator?" mid-task:

```python
# 1. Identify the KC the student is working on (from current task)
current_kc = "math/fractions/equivalent-fractions"

# 2. Fetch prerequisite KCs and their mastery levels for this student
prerequisites = skill_graph.get_prerequisites(current_kc, student_id)
# → [{"kc": "math/fractions/what-is-a-fraction", "mastery": 0.91},
#    {"kc": "math/multiplication/times-tables", "mastery": 0.73}]

# 3. Inject as Docent context
system_addendum = f"""
The student is working on: {current_kc_description}
Their prerequisite mastery:
- Understands what a fraction is: 91% (strong)
- Multiplication facts: 73% (shaky — avoid relying on these in hints)
Explain using what they already know. Do not introduce new concepts.
"""
```

This prevents the Docent from explaining equivalent fractions using algebra or cross-multiplication — concepts the student hasn't reached. The curriculum graph is the guardrail.

### Neo4j vs Postgres for graph queries

The paper uses Neo4j. For our scale (<500 KCs, <200 students at pilot), Postgres with a `kc_edges` table and a recursive CTE is sufficient:

```sql
-- Fetch all prerequisites of a given KC (recursive)
WITH RECURSIVE prereqs AS (
  SELECT from_kc_id, to_kc_id FROM kc_edges WHERE to_kc_id = $target_kc
  UNION ALL
  SELECT e.from_kc_id, e.to_kc_id FROM kc_edges e
  JOIN prereqs p ON e.to_kc_id = p.from_kc_id
)
SELECT DISTINCT from_kc_id FROM prereqs;
```

Don't add Neo4j until you have a real graph-traversal pain point (>10K KCs, complex multi-hop queries that Postgres CTE can't handle efficiently).

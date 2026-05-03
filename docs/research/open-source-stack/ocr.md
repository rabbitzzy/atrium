# OCR and Handwriting Recognition

Three viable paths for extracting student answers from scanned worksheets. Choose based on cost, accuracy requirements, and infrastructure complexity.

## Decision matrix

| Path | Cost | Accuracy (K-5 print) | Chinese support | Complexity | Recommended phase |
|------|------|----------------------|-----------------|------------|-------------------|
| Multimodal LLM direct | ~$0.01–0.05/scan | 90–95% on clean; 80% on messy | Native | Lowest | Phase 1 |
| Pix2Text | Free (self-hosted) | 85–92% on clean math | Native (Simplified) | Medium | Phase 1 fallback |
| Mathpix API | $0.004/call | 95%+ on clean math | Limited | Low | Phase 2 if needed |

**Recommendation:** Start with multimodal LLM direct (Claude Sonnet). It transcribes *and* evaluates in one call, which halves latency. Add Pix2Text as a local fallback if API costs become a concern at scale.

---

## Path 1: Multimodal LLM direct (recommended start)

Send the cropped answer-region image directly to Claude / Gemini / GPT-4o with a combined "transcribe then evaluate" prompt. No separate OCR pipeline.

### Why this is often the right choice

- Published studies report 97–99% transcription accuracy on college-level handwriting, 90–95% on legible K-5 print. The fixed-template approach (see `docs/research/design-patterns.md`) constrains what region to look at, which pushes accuracy toward the high end.
- The LLM handles transcription uncertainty naturally: "I think this says '24' but the handwriting is unclear — marking for teacher review."
- One API call = transcription + rubric evaluation + misconception detection + suggestion generation. Splitting into OCR → separate eval adds latency and complexity for no gain at K-5 scale.
- Chinese character recognition is built into every frontier model at publication-level accuracy.

### Prompt pattern

```python
GRADING_SYSTEM = """
You are grading a handwritten K-5 student worksheet.
For each answer region:
1. Transcribe exactly what the student wrote. If illegible, say so explicitly.
2. Evaluate against the rubric provided.
3. Classify: mastered | shaky | needs-help | not-yet
4. Identify the misconception if wrong.
5. Write one age-appropriate suggestion in both English and Chinese.

Return valid JSON matching the EvaluationResult schema. No prose, no markdown fences.
"""

# User message: base64 image + rubric
user_content = [
    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}},
    {"type": "text", "text": f"Rubric: {json.dumps(rubric)}\nStudent age: {age}. Grade this."}
]
```

### Handling illegible handwriting

The evaluation prompt must explicitly instruct the model on what to do when transcription is uncertain:

```
If you cannot read a student's answer with >80% confidence:
- Set transcript to "unclear: [your best guess]"
- Set quality to "not-yet" 
- Set misconception to null
- Set suggestion to "Your writing was hard to read — try writing each digit bigger next time. / 你的字迹有点难辨认——下次试着把每个数字写大一点。"
```

Do not let the model hallucinate a confident transcription of illegible ink. The studies report 2–4% hallucination rates on unclear regions.

### Cost at scale

A typical scan: ~100KB JPEG, ~500 token system prompt (cached), ~200 token user prompt, ~300 token response.

| Volume | Approximate cost (Claude Sonnet) |
|--------|----------------------------------|
| 100 scans/day | ~$1–5/day |
| 1,000 scans/day | ~$10–50/day |
| 10,000 scans/day | ~$100–500/day |

For a single-school pilot (100–300 scans/week), this is negligible. Prompt caching on the system prompt cuts this further — see `impl/evaluator.md` for the cache_control setup.

---

## Path 2: Pix2Text (free, self-hosted)

**Repo:** `breezedeus/Pix2Text`  
**Install:** `pip install pix2text`

Open-source alternative to Mathpix. Recognizes:
- Printed text (80+ languages including Simplified and Traditional Chinese)
- Mathematical formulas → LaTeX
- Mixed math + text layouts
- Tables

### When to use

- You want to avoid API costs at scale (self-hosted inference)
- You want a local fallback when the Claude API is slow or down
- You want to pre-process images before sending a smaller payload to the LLM

### Accuracy expectations for K-5

Pix2Text was benchmarked primarily on printed academic text and typeset formulas, not children's handwriting. Expect:
- **Printed arithmetic** (digits, operators): 90–95% on legible work
- **Chinese characters** (printed, not cursive): 88–93%
- **Mixed math + Chinese**: 85–90%
- **Messy handwriting from a 6-year-old**: 70–80%

The fixed-template approach improves this significantly because you're cropping a tight answer region (fewer characters, known context) rather than parsing a free-form page.

### Basic usage

```python
from pix2text import Pix2Text

p2t = Pix2Text()

# Full page: auto-detects text vs math regions
result = p2t.recognize('worksheet_scan.jpg')

# Cropped answer region (preferred for our fixed-template approach)
answer = p2t.recognize_formula('answer_region_crop.jpg')  # math
answer = p2t.recognize_text('answer_region_crop.jpg')     # text/Chinese
```

---

## Path 3: Mathpix API (paid, high accuracy)

**Pricing:** ~$0.004 per call (2025), with free tier (1,000 calls/month)

Mathpix is the most accurate off-the-shelf math OCR API. Their model was trained on millions of typeset and handwritten expressions. Strength: college-level math notation. Weakness: less tuned for K-5 print handwriting specifically, limited Chinese character support.

**When to reach for Mathpix:**
- Phase 2+ when students are doing multi-step algebra or fraction work where formula precision matters
- If Pix2Text accuracy on math formulas falls below 90% in practice

For the K-5 pilot, multimodal LLM or Pix2Text is the better default — Mathpix's edge is on complex notation that K-5 doesn't produce.

---

## MathWriting dataset (for future fine-tuning)

**Source:** Google DeepMind (2024)  
**Size:** 230K human-written + 400K synthetic handwritten math expressions, LaTeX labels

If you ever want to fine-tune your own handwriting recognition model specifically for K-5 math, this is the training data to start with. Annotated at the expression level (not character level), so training data aligns well with the "evaluate the whole answer region" approach.

Realistically a v3+ concern. At pilot scale, use the API paths above.

---

## TAMER and Uni-MuMER (research bookmarks)

These are current SOTA for handwritten mathematical expression recognition (HME):

- **TAMER** (2024) — Tree-structured Attention for Math Expression Recognition. Improves on layout parsing for complex nested expressions.
- **Uni-MuMER** (2024) — Unified model for multi-modal math understanding and recognition.

Both require GPU inference and are not trivially deployable. Bookmark for when the pilot data shows a specific accuracy ceiling worth addressing with a custom model.

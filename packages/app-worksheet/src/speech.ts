/**
 * The Debrief, out loud (BHCS-15).
 *
 * A second rendering of the same result, for the student who cannot read the
 * first one. The platform owns the voice; this owns the words, because only
 * this package knows that a quality tier exists, which of its fields are prose
 * and which are bookkeeping, and what a `null` misconception means.
 *
 * ── It follows the screen, and it does not summarise it ─────────────────────
 *
 * Same order as `WorksheetResult`: the overall verdict, then the summary, then
 * each question in turn. A child who can decode a little is reading along, and
 * a spoken version that reordered or condensed the page would leave them
 * hunting for the sentence they just heard.
 *
 * It is also not an abridgement. The temptation with audio is to read the
 * encouraging half and leave the diagnosis on screen — which protects nobody,
 * because the diagnosis is the half they cannot read. If the finding is fit to
 * put in front of a five-year-old in writing, it is fit to say to them.
 *
 * ── What is deliberately not spoken ─────────────────────────────────────────
 *
 * The transcript. On screen "You wrote 7" is a useful anchor; read aloud in a
 * shared room it is that child's wrong answer announced at conversational
 * volume, and it adds nothing they do not already have in their hand. The
 * feedback needs saying; their own answer does not.
 *
 * `next_focus` is not spoken either, for the reason `reading-level.ts` gives
 * for writing it in plain technical English: it is for the teacher and the
 * planner, and it was never addressed to the student.
 *
 * ── Why the Chinese half is shorter ─────────────────────────────────────────
 *
 * Only `summary_zh` and the tier labels exist in Chinese; `misconception` and
 * `suggestion` are written in English by the prompt. So the Chinese script says
 * what the Chinese half of the Debrief actually says, and stops. Feeding
 * English sentences to a Mandarin voice would produce something no one can
 * follow, and pretending the two languages carry equal detail here would hide a
 * real gap — one worth closing in the prompt rather than papering over in the
 * player.
 *
 * Pure, like `reading-level.ts` next to it: a shape in, strings out, testable
 * without a browser or a synthesiser.
 */

import type { SpokenScript } from '@atrium/schema'
import type { WorksheetOcr } from './index'
import { qc } from './tiers'

/**
 * Defensive about every field, and not only for streamed results.
 *
 * This runs against whatever is in `captures.ocr_json`, including rows the
 * Python evaluator wrote and rows from before a schema change. A Debrief that
 * throws while a child is pressing the button is worse than one that reads out
 * what it has.
 */
export function worksheetSpeech(result: WorksheetOcr): SpokenScript {
  const en: string[] = []
  const zh: string[] = []

  if (result?.overall_quality) {
    en.push(`${qc(result.overall_quality).label}.`)
    zh.push(`${qc(result.overall_quality).labelZh}。`)
  }
  if (result?.summary_en?.trim()) en.push(result.summary_en.trim())
  if (result?.summary_zh?.trim()) zh.push(result.summary_zh.trim())

  for (const q of result?.questions ?? []) {
    if (!q) continue
    /*
     * The number the screen shows, not the position in the array. They differ
     * on a page with two sections — the model transcribes both as 1, 2, 3 —
     * and saying "number four" while the pill beside it reads 1 sends a child
     * looking for a question that is not there. Whatever the screen claims,
     * the voice claims.
     */
    const label = q.number == null ? 'Next question' : `Number ${q.number}`
    const labelZh = q.number == null ? '下一题' : `第${q.number}题`

    en.push(`${label}. ${qc(q.quality ?? '').label}.`)
    zh.push(`${labelZh}：${qc(q.quality ?? '').labelZh}。`)

    // Both are nullable in the schema and are usually absent on an answer the
    // student got right, which is why a mastered question is one short line.
    if (q.misconception?.trim()) en.push(q.misconception.trim())
    if (q.suggestion?.trim()) en.push(q.suggestion.trim())
  }

  return { en, zh }
}

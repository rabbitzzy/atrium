/**
 * The four quality tiers, as a child meets them.
 *
 * The four ids are the rubric's and stay exactly as they are — they are in the
 * enum, in `captures.ocr_json`, and in the Python evaluator, and renaming a
 * stored value to improve a screen is how a dataset stops meaning one thing.
 * What changes is that a child never sees them. "shaky" and "not-yet" are
 * assessment vocabulary: they are written *about* students, for adults, and
 * they read to a seven-year-old as a verdict on them rather than on one answer.
 *
 * So each tier carries a label that says the same thing to the person who did
 * the work — in both languages, because a child who stalls on the English
 * should still know how they did.
 *
 * ── Why the emoji is its own field ──────────────────────────────────────────
 *
 * The emoji is doing real work on screen: it is what a pre-reader sorts the
 * page by. It does nothing out loud, and worse than nothing — a synthesiser
 * reading `⭐ You got it` says either "star" or an awkward pause before the
 * sentence that matters. Since BHCS-15 the same table feeds the screen and the
 * voice, so the picture and the words are separate fields and each medium takes
 * what it can use. One table, two renderings, no second copy of the wording to
 * drift.
 *
 * Keyed by string rather than QualityTier so an unrecognized tier falls back
 * instead of crashing the Debrief — the `satisfies` keeps the four real tiers
 * exhaustive without giving up that fallback.
 */

import type { QualityTier } from '@atrium/schema'

export interface TierLook {
  bg: string
  color: string
  /** Screen only. Never spoken. */
  emoji: string
  label: string
  labelZh: string
}

export const QUALITY: Record<string, TierLook> = {
  mastered: { bg: '#d4f0e0', color: '#1a7a4a', emoji: '⭐', label: 'You got it', labelZh: '会了' },
  shaky: { bg: '#fff3d4', color: '#8a6a00', emoji: '👍', label: 'Almost', labelZh: '快会了' },
  // Not "needs help" — help is what happens next, not what is wrong with them.
  'needs-help': { bg: '#ffe0d4', color: '#c04010', emoji: '🤝', label: 'Let’s look together', labelZh: '一起看看' },
  // "Not yet" is the whole point of the tier and survives translation intact:
  // it says the door is open, which "not-yet" as a bare token never did.
  'not-yet': { bg: '#eef1f5', color: '#5a6472', emoji: '🌱', label: 'Not yet', labelZh: '还没学会' },
} satisfies Record<QualityTier, TierLook>

/** The look for a tier, falling back rather than throwing on an unknown one. */
export const qc = (quality: string): TierLook => QUALITY[quality] ?? QUALITY['not-yet']!

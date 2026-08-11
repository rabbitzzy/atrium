/**
 * How simply to write, per language (BHCS-14).
 *
 * A TK student and a fifth-grader used to get the same Debrief prose: the
 * prompt asked for age-appropriateness without ever being told the age, so the
 * model had no option but to write to the middle of a seven-year range. That is
 * wrong at both ends — unreadable at one, babyish at the other, and babyish is
 * its own kind of shaming.
 *
 * Three things shape everything below.
 *
 * **The dial is on the wording, never on the diagnosis.** Simpler prose does
 * not mean a vaguer finding. "You added the ones but forgot to carry the ten"
 * is both readable by a five-year-old and exactly as specific as the sentence a
 * teacher would want. What must never happen is the finding itself softening
 * into "keep practising".
 *
 * **Two levels, not one.** For BHCS's heritage learners, English and Chinese
 * reading come apart — `docs/research/open-source-stack/curriculum-content.md`
 * puts these students near PRC national standards in listening and cultural
 * knowledge but nearer HSK in reading and writing formality. A child who reads
 * English at grade 4 may read Chinese at grade 1. One level applied to both
 * makes `summary_zh` unreadable or `summary_en` condescending.
 *
 * **Grade is a prior, and usually an absent one.** `api/_lib/bhcs.ts` is blunt
 * about it: most roster rows have no grade, and it is never something to gate
 * on. So the no-grade case is the common case and has to produce good output on
 * its own — which it can, because the model is looking at the child's
 * handwriting, and the schema makes it transcribe that before it writes a word
 * of feedback.
 *
 * Pure, and deliberately so: this is a string builder over a number, which
 * makes the wording decisions readable in a test rather than only observable in
 * a model response.
 */

import type { CaptureContext } from '@atrium/schema'

/**
 * Four bands, because the operational difference between adjacent grades is
 * nil and the difference across two is large. Named for what the reader can do,
 * not for a grade, since the same band is reached at different ages in the two
 * languages.
 */
export type Band = 'emerging' | 'early' | 'developing' | 'fluent'

/** Simplest first. The order is the shift in `chineseBand`, so it is load-bearing. */
const BANDS: readonly Band[] = ['emerging', 'early', 'developing', 'fluent']

/**
 * English reading band from US grade. TK and K both arrive here as 0 —
 * `parseGrade` floors them — and grade 6+ only appears when an admin has typed
 * something optimistic, so it clamps rather than extends.
 */
export function bandForGrade(grade: number | null | undefined): Band | null {
  if (typeof grade !== 'number' || !Number.isFinite(grade)) return null
  if (grade <= 0) return 'emerging'
  if (grade <= 2) return 'early'
  if (grade <= 4) return 'developing'
  return 'fluent'
}

/**
 * The heritage-learner shift: one band below English, floored.
 *
 * One band is roughly two grades, which is the low end of the gap the
 * curriculum research describes and the conservative choice — writing Chinese
 * one band simpler than a child can read costs them nothing, and writing it one
 * band harder costs them the whole sentence.
 *
 * This is a prior about a population, not a claim about a person, and the
 * brief below says so: a page with the child's own Chinese on it outranks it.
 */
export function chineseBand(english: Band): Band {
  return BANDS[Math.max(0, BANDS.indexOf(english) - 1)]!
}

/**
 * What each band means in prose the model can actually act on. Sentence length
 * and clause count, not adjectives — "write simply" is what the old prompt
 * effectively said and it is what produced the middle-of-the-range voice.
 */
const ENGLISH: Record<Band, string> = {
  emerging:
    'Up to about 8 words a sentence, one clause, no subordinate clauses. Only words a child hears in speech every day. Say "trade" or "swap", not "regroup"; "the same as", not "equivalent".',
  early:
    'Up to about 12 words a sentence, one idea each. Everyday words, with a subject word introduced only when the sentence itself explains it.',
  developing:
    'Up to about 18 words a sentence, two clauses are fine. Use the subject vocabulary plainly — "numerator", "carry", "syllable" — and expect it to be understood.',
  fluent:
    'Ordinary written sentences, no length rule. Subject vocabulary used directly, and reasoning that spans two sentences is fine.',
}

/**
 * The Chinese equivalents, in characters rather than words, and with the
 * register rule that matters most for these readers: a child who reads Chinese
 * at the lower bands is stopped dead by 成语 and by written-register phrasing
 * long before they are stopped by sentence length.
 */
const CHINESE: Record<Band, string> = {
  emerging:
    '每句不超过 10 字。只用最常见的字（一年级水平），不用成语，不用书面语。写不出来的字宁可换一个说法，也不要用生僻字。',
  early: '每句不超过 16 字，用常用词和双字词，不用成语，不用书面语。',
  developing: '每句不超过 24 字，可以用学校里学过的学科词，仍然避免成语和书面语。',
  fluent: '自然的口语化中文，长度不限，可以用学科词。',
}

/**
 * The instructions that hold at every level, and the reason the no-grade case
 * is not a degraded one.
 *
 * The evidence rule is the important half. `WORKSHEET_SCHEMA` pins
 * `propertyOrdering` so that every question — and every `transcript` inside it
 * — is written before `summary_en` and `summary_zh`. So by the time the model
 * reaches the summaries it has already transcribed the child's own vocabulary,
 * spelling and sentence length, in both languages, verbatim. That is fresher
 * evidence of reading level than a grade an admin typed at enrolment, and it
 * costs nothing extra to use: it is already in the response.
 *
 * (Per-question `suggestion` is written directly after that question's own
 * transcript, so it has less evidence to work from — one answer rather than the
 * page. Still the child's handwriting, still better than nothing.)
 */
const ALWAYS = `Two reading levels, not one. Pitch summary_en and every English line to the
English level; pitch summary_zh to the Chinese level. For our heritage learners
Chinese usually sits lower than English, and a Chinese sentence pitched at the
English level is a sentence the child cannot read.

The handwriting on the page outranks anything you are told here. You transcribe
every answer before you write any feedback, so by then you have seen this
child's own vocabulary, spelling and sentence length. Trust that over the
levels below, in whichever language the page gives it to you — and only in that
language. A page of confident English says nothing about their Chinese.

The sentence lengths below are limits, not averages. Count the words before you
write a sentence, and split it rather than run past the limit. One long sentence
is never allowed; more short ones always are.

The limit is on how long a sentence may be. It is not a limit on how many you
write, and it is never a limit on how much you tell the student. If naming what
they did takes four short sentences, write four short sentences. A summary that
came out vague because it was trying to stay brief has failed at the only job it
has.

Simpler wording, never a smaller finding. Name the exact thing the student did,
at every level. "You added the ones but forgot to carry the ten" is readable by
a five-year-old and is exactly as precise as a teacher needs. "Nice try, keep
practising" is not simpler, it is empty, and it is the one thing that is wrong
at every level.

summary_zh carries the same meaning as summary_en and names the same specific
thing. It is not a transliteration, and it is not a word-for-word translation
either: it is that meaning written for a different reader, so it may be shorter
and plainer than the English, and that is correct rather than lazy.

next_focus is read by a teacher and by the planner, never by the student. Write
it as a precise skill name in ordinary technical English, whatever the levels
below say.

Never mention any of this. No level, no grade, no "here is a simpler way to say
it" — the student is reading feedback about their work, and there is no dial
for them to discover.`

/**
 * The no-grade default, which is most captures.
 *
 * It does not apologise for what it does not know, and it does not fall back to
 * the middle: with no evidence at all it asks for simple *structure*, because
 * the risk is asymmetric. A fluent reader loses nothing to a short clear
 * sentence, while an emerging reader loses everything to a long one. Note what
 * is *not* being defaulted downwards — the substance, the specificity, and the
 * tone all stay exactly where they are at every band. Babyishness comes from
 * cutesiness and empty praise, not from short sentences.
 */
const NO_GRADE = `You have not been told this student's grade, which is normal — most of the
roster has none recorded. Read their level off their handwriting instead.

If the page gives you nothing to go on either, keep the sentences short and the
structure simple, and keep the content exactly as specific as it would otherwise
be. Short sentences cost a strong reader nothing; long ones cost a new reader
everything. Do not compensate by writing less, and never by writing warmer.`

/**
 * The whole wording section of the worksheet system prompt, for this student.
 *
 * Total by construction: every grade, and the absence of one, produces a brief.
 */
export function readingLevelBrief(ctx: CaptureContext): string {
  const english = bandForGrade(ctx.student.grade)

  if (!english) return `${ALWAYS}\n\n${NO_GRADE}`

  const zh = chineseBand(english)
  const grade = ctx.student.grade === 0 ? 'TK or kindergarten' : `grade ${ctx.student.grade}`

  return `${ALWAYS}

This student is in ${grade}. Take that as a starting point, not a verdict — it
is what an adult typed at enrolment, and the page in front of you is newer.

English level — ${english}. ${ENGLISH[english]}

Chinese level — ${zh}. ${CHINESE[zh]}`
}

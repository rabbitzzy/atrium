/**
 * What the station says while it is making a Card.
 *
 * Pressing a door starts twenty to thirty seconds of nothing: a planner query,
 * a Gemini call, a task row, a headless Chromium, a print job. The screen used
 * to answer that with one grey line — "Getting your Card… 正在准备…" — and four
 * buttons that were merely `disabled`, which to a seven-year-old is a screen
 * that has stopped working. The reliable next move for a child in front of a
 * screen that has stopped working is to press something else.
 *
 * So the wait is filled, and it is filled with the truth: what they chose, what
 * is being done about it, and what is going to come out of the printer. A child
 * who can see the station working will wait for it. A child who cannot, won't.
 *
 * ── Written as talk, not as progress ──
 *
 * No percentage, no spinner-with-stages, no fake progress bar — the durations
 * here are honest guesses and a bar that fills to 90% and stops is a worse lie
 * than no bar. The lines arrive one at a time the way someone talking would say
 * them, oldest scrolling up, so the screen is visibly moving even when the
 * network is not.
 *
 * The tail repeats rather than running out. If generation takes longer than the
 * script, the alternative is a frozen last line, which is the exact impression
 * the whole screen exists to avoid.
 *
 * Pure: a list of lines and when to show each. The scrolling is in the
 * component, the wording is tested here.
 */

export interface PreparingLine {
  en: string
  zh: string
  /** Milliseconds after the button press. */
  at: number
}

/** The door the child pressed, named back to them. */
const SUBJECT: Record<string, { en: string; zh: string; work: { en: string; zh: string } }> = {
  math: {
    en: 'Math',
    zh: '数学',
    work: { en: 'numbers, and a bit of thinking', zh: '数字，还要动动脑筋' },
  },
  'lang/zh': {
    en: 'Chinese',
    zh: '中文',
    work: { en: 'characters and sentences', zh: '汉字和句子' },
  },
  'lang/en': {
    en: 'English',
    zh: '英语',
    work: { en: 'reading and writing', zh: '阅读和书写' },
  },
}

const LUCKY = {
  en: 'a lucky pick',
  zh: '碰运气',
  work: { en: "whatever you're ready for", zh: '你正好该练的' },
}

/** Roughly how long a line stays the newest one. Slow enough for a slow reader. */
const BEAT = 2300

/**
 * The script for one wait.
 *
 * `simulate` changes two lines and nothing else: in simulate mode nothing goes
 * to the printer and no paper is used, and telling a child to go and stand by
 * the printer when nothing will come out of it is the kind of small lie that
 * makes them stop trusting the rest of the screen.
 */
export function prepareScript(subject: string | undefined, simulate = false): PreparingLine[] {
  const s = (subject && SUBJECT[subject]) || LUCKY

  const lines: [string, string][] = [
    [`${s.en} it is! Nice pick.`, `就做${s.zh}！好选择。`],
    [`Let me find the right spot for you.`, `我来找一找你现在该练什么。`],
    [`Looking at what you've already got…`, `先看看你已经会的东西……`],
    [`Found it. Today is ${s.work.en}.`, `找到了。今天练的是${s.work.zh}。`],
    [`Now I'm writing your questions.`, `现在我在给你出题。`],
    [`Not too easy — you'd be bored.`, `不会太简单，太简单就没意思了。`],
    [`Not too hard either. Just right.`, `也不会太难。刚刚好。`],
    [`Writing them in English and in Chinese.`, `英文和中文都写一遍。`],
    [`Checking each one has an answer.`, `再检查一遍，每道题都有答案。`],
    [`Putting your name and your code on top.`, `把你的名字和条码放在最上面。`],
    simulate
      ? [`Getting it ready on the screen.`, `马上在屏幕上给你看。`]
      : [`Sending it to the printer now.`, `现在送去打印机。`],
    simulate
      ? [`No paper today — this one stays on screen.`, `今天不用纸，这张就在屏幕上做。`]
      : [`Go and stand by the printer in a moment.`, `等一下就去打印机那边拿。`],
    [`Almost there. Thanks for waiting.`, `快好了，谢谢你等我。`],
    [`Still working — you don't have to press anything.`, `还在忙，你什么都不用按。`],
    [`Nearly done. Have a pencil ready.`, `马上就好，先准备一支铅笔。`],
  ]

  return lines.map(([en, zh], i) => ({ en, zh, at: i * BEAT }))
}

/**
 * How many lines should be on screen at `elapsed`.
 *
 * Clamped to the length of the script, so a wait that outlasts it holds on the
 * full list rather than emptying. `holdFrom` is where the caller starts
 * repeating the tail — see `tailLine`.
 */
export function linesShown(script: PreparingLine[], elapsed: number): PreparingLine[] {
  return script.filter((l) => l.at <= elapsed)
}

/**
 * The line to keep saying once the script has run out.
 *
 * Cycles through the last three rather than sticking on one, because a screen
 * whose newest line has not changed in a minute reads as frozen, which is the
 * thing this whole file is for. Returns null while the script is still running.
 */
export function tailLine(script: PreparingLine[], elapsed: number): PreparingLine | null {
  const last = script[script.length - 1]
  if (!last || elapsed < last.at + BEAT) return null

  const pool = script.slice(-3)
  const beats = Math.floor((elapsed - last.at - BEAT) / BEAT)
  const line = pool[beats % pool.length]
  return line ? { ...line, at: elapsed } : null
}

export const PREPARING_BEAT_MS = BEAT

/**
 * What the Leaf count says, in every state (BHCS-40).
 *
 * A gate nobody can see is just a thing that stops working for no reason. The
 * balance has to be present during a Visit, and the zero state has to teach
 * rather than block.
 *
 * ── The copy rules are the feature ──
 *
 * Never "you can't print" and never "printing is blocked". Every state is
 * framed as earning, because that is what is actually true: a child at zero is
 * at a natural pause in the loop, not in trouble, and the thing that ends the
 * pause is the thing we want them to do anyway.
 *
 * And no eco-shaming, ever. The Docent does not say "save the trees" or "don't
 * waste paper". The system communicates its values through structure — you get
 * a sheet by turning one in — and a child who is told off for wanting paper
 * learns something quite different from a child who has to earn it.
 *
 * ── The zero state needs a way out on screen ──
 *
 * `eco-design.md` gives two, and naming both is what turns a dead end into an
 * instruction: turn in a Card you have already done, or ask a teacher. A child
 * who can see only that they are stuck will ask an adult what is wrong with the
 * machine; one who can see two doors will use one.
 *
 * Pure, so the wording can be argued with in a test rather than only found on a
 * screen. `speech` is separate from the label for the reason BHCS-15 gives: the
 * leaf is a picture, and a synthesiser reading it aloud says "herb" or pauses.
 */

/** Eco green, and a muted amber for zero — a low-resource signal, never red. */
export const LEAF_GREEN = '#4a7c59'
export const LEAF_AMBER = '#c8963e'

export const LEAF_CEILING = 5

export interface LeafLook {
  color: string
  /** Screen only. Never spoken. */
  glyph: string
  labelEn: string
  labelZh: string
  /** The line beside the count. Empty at the ordinary in-between balances. */
  hintEn: string
  hintZh: string
  /** Shown only at zero: the two ways out. */
  waysOut: ReadonlyArray<{ en: string; zh: string }>
  /** What the Docent says if asked to read it. Never includes the glyph. */
  speech: { en: string[]; zh: string[] }
}

const WAYS_OUT = [
  {
    en: 'Turn in a Card you have already done',
    zh: '把已经做完的练习卡交回来',
  },
  {
    en: 'Ask your teacher for a Leaf',
    zh: '请老师给你一片叶子',
  },
] as const

/**
 * Zero because they spent them, or zero because nobody set them up?
 *
 * The same number, two situations, and only one of them is fixed by turning in
 * a Card. Telling a child who has never held one to hand one back is a rule
 * they cannot follow and will experience as the machine being broken — which is
 * exactly what the zero state was written to avoid.
 *
 * `bootstrapped` comes straight from the service: false means there is no print
 * state at all, which happens only before a teacher has placed them.
 */
export function leafLook(balance: number, bootstrapped = true): LeafLook {
  const n = Math.max(0, Math.min(LEAF_CEILING, Math.round(balance)))
  const unitEn = n === 1 ? 'Leaf' : 'Leaves'

  if (!bootstrapped) {
    return {
      color: LEAF_AMBER,
      glyph: '🌿',
      labelEn: 'Not set up yet',
      labelZh: '还没有设置',
      hintEn: 'Ask your teacher to get you started',
      hintZh: '请老师帮你开始',
      waysOut: [
        { en: 'Your teacher sets up your first Cards', zh: '老师会帮你准备第一批练习卡' },
      ],
      speech: {
        en: ["You're not set up yet.", 'Ask your teacher to get you started.'],
        zh: ['你还没有设置好。', '请老师帮你开始。'],
      },
    }
  }

  if (n === 0) {
    return {
      color: LEAF_AMBER,
      glyph: '🌿',
      labelEn: `0 ${unitEn}`,
      labelZh: '0 片叶子',
      hintEn: 'Submit your Card to earn one',
      hintZh: '交回练习卡就能得到一片',
      waysOut: WAYS_OUT,
      speech: {
        en: ["You're out of Leaves for now.", "Turn in your Card and you'll earn one right away."],
        zh: ['你现在没有叶子了。', '把练习卡交回来，马上就能得到一片。'],
      },
    }
  }

  if (n >= LEAF_CEILING) {
    return {
      color: LEAF_GREEN,
      glyph: '🌿',
      labelEn: `${n} ${unitEn}`,
      labelZh: `${n} 片叶子`,
      hintEn: 'Print your next Card to keep growing',
      hintZh: '打印下一张练习卡，继续成长',
      waysOut: [],
      speech: {
        en: [`You have ${n} Leaves — that's as many as you can hold.`, 'Print your next Card to keep growing.'],
        zh: [`你有 ${n} 片叶子，已经是最多啦。`, '打印下一张练习卡，继续成长。'],
      },
    }
  }

  return {
    color: LEAF_GREEN,
    glyph: '🌿',
    labelEn: `${n} ${unitEn}`,
    labelZh: `${n} 片叶子`,
    hintEn: '',
    hintZh: '',
    waysOut: [],
    speech: {
      en: [`You have ${n} ${unitEn}.`],
      zh: [`你有 ${n} 片叶子。`],
    },
  }
}

/**
 * What the Docent says at the two moments the balance changes.
 *
 * Kept here beside the states rather than at the call sites, so the whole
 * vocabulary of the Leaf economy is one file that can be read end to end and
 * checked for tone in one pass.
 */
export function earnedLine(balance: number): { en: string; zh: string } {
  return balance >= LEAF_CEILING
    ? {
        en: "Nice work! You've got as many Leaves as you can hold — print a Card whenever you're ready.",
        zh: '做得好！你的叶子已经满啦，随时可以打印一张练习卡。',
      }
    : {
        en: 'Nice work! You just grew a new Leaf. Ready to print your next Card?',
        zh: '做得好！你刚刚长出了一片新叶子。要打印下一张练习卡吗？',
      }
}

export function spentLine(remaining: number): { en: string; zh: string } {
  const unit = remaining === 1 ? 'Leaf' : 'Leaves'
  return {
    en: `Here comes your Card! One Leaf used — you've got ${remaining} ${unit} left.`,
    zh: `你的练习卡来啦！用掉一片叶子，你还有 ${remaining} 片。`,
  }
}

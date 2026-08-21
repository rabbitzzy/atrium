/**
 * See what a Room's problems would look like, without spending anything.
 *
 * Authoring content is a loop — change the wording, look at what comes back,
 * change it again — and the only loop available was `POST /generate`, which
 * takes a Leaf, writes a `tasks` row and launches a headless Chromium to make
 * a PDF. None of that helps you decide whether the multiplication questions
 * are any good, and the Leaf makes a child's ledger a record of an adult
 * rewriting a prompt.
 *
 * This calls the same `buildProblemPrompt` and the same schema against the same
 * model, and stops at the JSON. No Leaf, no task row, no paper.
 *
 *   pnpm -F @atrium/worksheet-print try math/ops/multiplication-facts
 *   pnpm -F @atrium/worksheet-print try math/ops/word-problems-1-step lang/zh/reading/sentence-meaning
 *   pnpm -F @atrium/worksheet-print try --grade 5 math/fractions/compare
 *   pnpm -F @atrium/worksheet-print try --prompt math/fractions/equivalent
 *
 * `--grade` overrides the band, which is the knob worth having here: the band
 * decides both how many problems are asked for and how long each may be, and
 * those are the constraints most likely to be the reason a Card reads badly.
 * `--prompt` prints what the model was actually told.
 */

import { config } from 'dotenv'
// The repo-root `.env`, resolved the same way `index.ts` does it. `dotenv/config`
// reads the working directory, which under `pnpm -F` is this package — where
// there is no `.env`, so the key silently comes back undefined and Gemini
// answers API_KEY_INVALID.
config({ path: new URL('../../../.env', import.meta.url).pathname })

import { fetchRooms } from './blueprint.js'
import { layoutFor } from './template.js'
import { buildProblemPrompt, PROBLEM_SCHEMA, validateProblems } from './problems.js'

const GEMINI_MODEL = process.env['GEMINI_MODEL'] ?? 'gemini-2.5-flash'

const dim = (s: string) => `[2m${s}[0m`

async function main() {
  const argv = process.argv.slice(2)
  const gradeAt = argv.indexOf('--grade')
  const override = gradeAt >= 0 ? Number(argv[gradeAt + 1]) : undefined
  const showPrompt = argv.includes('--prompt')
  // `gradeAt + 1` is only a value to skip when there was a `--grade` at all;
  // at -1 it points straight at the first argument.
  const kcIds = argv.filter((a, i) => !a.startsWith('--') && !(gradeAt >= 0 && i === gradeAt + 1))

  if (kcIds.length === 0) {
    console.error('usage: try [--grade N] [--prompt] <kc-id> [kc-id ...]')
    process.exit(1)
  }

  const rooms = await fetchRooms(kcIds)
  const difficulty = override ?? Math.max(...rooms.map((r) => r.difficulty))
  const layout = layoutFor(difficulty)
  const prompt = buildProblemPrompt(rooms, { count: layout.slots, chars: layout.promptChars })

  console.log(
    `\n${rooms.map((r) => `${r.labelEn} / ${r.labelZh}`).join(' + ')}` +
      `\ngrade ${difficulty} → ${layout.slots} problems, ~${layout.promptChars} chars each\n`,
  )
  if (showPrompt) console.log(`${'─'.repeat(72)}\n${prompt}\n${'─'.repeat(72)}\n`)

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env['GEMINI_API_KEY']}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { response_mime_type: 'application/json', response_schema: PROBLEM_SCHEMA },
      }),
    },
  )
  if (!res.ok) {
    console.error(`Gemini answered ${res.status}: ${await res.text()}`)
    process.exit(1)
  }

  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const problems = validateProblems(
    JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'),
    layout.slots,
  )

  for (const p of problems) {
    // The character count sits next to every prompt because the budget is the
    // constraint most likely to be the reason a question reads badly, and it is
    // invisible until something counts it.
    console.log(`${p.number}. ${p.promptEn}  ${dim(`[${p.promptEn.length}]`)}`)
    console.log(
      `   ${p.promptZh}  ${dim(`[${p.promptZh.length}] · ${p.answerLines} line${p.answerLines === 1 ? '' : 's'}`)}\n`,
    )
  }

  const over = problems.filter(
    (p) => p.promptEn.length > layout.promptChars || p.promptZh.length > layout.promptChars,
  )
  if (over.length > 0) {
    console.log(
      dim(
        `${over.length} of ${problems.length} run over ${layout.promptChars} chars and will be set in smaller type on the Card.`,
      ),
    )
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

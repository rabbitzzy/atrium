/**
 * The wording dial, on a real page (BHCS-14).
 *
 * Runs the worksheet pipeline over one stored capture several times, once per
 * student grade, and prints the Debriefs side by side. Same image, same model,
 * same prompt but for the reading-level brief — so the difference on screen is
 * the feature and nothing else.
 *
 * It exists for the same reason `resolve-lab.html` does: the thing being
 * checked is otherwise only reachable with a printed worksheet, a camera, and a
 * student whose roster grade happens to be the one you wanted to see. Prompt
 * wording is also iterative in a way validators are not — a limit the model
 * quietly treats as a suggestion is not visible in any test, only in output.
 *
 * Costs a model call per grade, so it is a script and not a test.
 *
 *   pnpm -F @atrium/kiosk level-lab <image.jpg> 0 3 null
 */

import { readFileSync } from 'node:fs'
import { runPipeline } from '../api/_lib/pipelines'
import { worksheetServer } from '@atrium/app-worksheet/server'
import type { WorksheetOcr } from '@atrium/app-worksheet'

const [, , file, ...grades] = process.argv

if (!file || grades.length === 0) {
  console.error('usage: level-lab <image.jpg> <grade|null> [grade|null …]')
  process.exit(1)
}

const image = readFileSync(file)

for (const arg of grades) {
  // `null` spelled out, because it is the case worth looking at most often:
  // most of the roster has no grade and the brief has to work without one.
  const grade = arg === 'null' ? null : Number(arg)
  const startedAt = Date.now()

  const outcome = await runPipeline(worksheetServer, image, 'image/jpeg', {
    student: { id: 'level-lab', name: 'Level Lab', grade },
  })

  console.log(`\n${'='.repeat(78)}`)
  console.log(`grade ${arg} — ${outcome.status}, ${Date.now() - startedAt}ms`)
  console.log('='.repeat(78))

  if (outcome.status !== 'ok') {
    console.log(outcome.error)
    continue
  }

  const result = outcome.data as WorksheetOcr
  console.log(`EN  ${result.summary_en}`)
  console.log(`ZH  ${result.summary_zh}`)
  // Printed to be checked for the opposite of everything above: next_focus is
  // read by a teacher and the planner, so it should not move with the dial.
  console.log(`→   ${result.next_focus}`)

  for (const q of result.questions) {
    console.log(`\n  ${q.number}. [${q.quality}] ${q.transcript}`)
    if (q.misconception) console.log(`     ${q.misconception}`)
    if (q.suggestion) console.log(`     ${q.suggestion}`)
  }
}

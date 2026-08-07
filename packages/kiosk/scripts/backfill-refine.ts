/**
 * Replay refinement over captures taken before their app had a refine step.
 *
 *     pnpm --filter @atrium/kiosk backfill:refine          # report only
 *     pnpm --filter @atrium/kiosk backfill:refine --write  # actually write
 *
 * Safe to run repeatedly, and safe to run against real data: refinement is
 * pure logic over an extraction that is already stored, so this makes no model
 * calls, costs nothing, and needs no images. It reads `ocr_json` and writes
 * `refined_json` — never the other way around, and never over the top.
 *
 * Dry by default. A backfill that writes on the strength of a typo is a worse
 * failure than one that needs a second command.
 */

import { atrium } from '../api/_lib/db'
import { appById } from '../api/_lib/registry'

interface Row {
  id: string
  kind: string
  student_name: string
  captured_at: string
  ocr_json: unknown
  ocr_status: string
}

const WRITE = process.argv.includes('--write')

async function main() {
  const db = atrium()

  // Rows that were extracted successfully but never refined. Rows that failed
  // or skipped extraction have nothing to refine, and rows already carrying a
  // refined_json are left alone — re-refining would churn without changing
  // anything, and would overwrite a human's later correction if one exists.
  const { data, error } = await db
    .from('captures')
    .select('id, kind, student_name, captured_at, ocr_json, ocr_status')
    .eq('ocr_status', 'ok')
    .is('refined_json', null)
    .order('captured_at', { ascending: true })

  if (error) throw new Error(`Query failed: ${error.message}`)
  const rows = (data ?? []) as Row[]

  console.log(`${rows.length} capture(s) extracted but not refined\n`)

  let refined = 0
  let skipped = 0
  let failed = 0

  for (const row of rows) {
    const app = appById(row.kind)
    const label = `${row.captured_at.slice(0, 10)}  ${row.kind.padEnd(10)} ${row.student_name}`

    // An app with no refine step has nothing to backfill. Marking the row
    // 'skipped' rather than leaving it null is what stops it from being
    // re-examined on every future run.
    if (!app?.refine) {
      skipped++
      if (WRITE) {
        const { error: err } = await db
          .from('captures')
          .update({ refined_status: 'skipped' })
          .eq('id', row.id)
        if (err) throw new Error(`Update failed for ${row.id}: ${err.message}`)
      }
      console.log(`  skip     ${label}  (no refine step)`)
      continue
    }

    try {
      const result = await app.refine(row.ocr_json)
      const counts = (result as { counts?: Record<string, number> }).counts
      const summary = counts
        ? Object.entries(counts)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${n} ${k}`)
            .join(', ')
        : 'refined'

      if (WRITE) {
        const { error: err } = await db
          .from('captures')
          .update({ refined_json: result, refined_status: 'ok', refined_error: null })
          .eq('id', row.id)
        if (err) throw new Error(`Update failed for ${row.id}: ${err.message}`)
      }
      refined++
      console.log(`  ok       ${label}  ${summary}`)
    } catch (err) {
      // One bad row must not stop the run: the whole point is to get through
      // the history, and a capture that cannot be refined is exactly the kind
      // of thing worth recording rather than crashing on.
      failed++
      const message = (err as Error).message
      if (WRITE) {
        const { error: updateErr } = await db
          .from('captures')
          .update({ refined_status: 'failed', refined_error: message })
          .eq('id', row.id)
        if (updateErr) throw new Error(`Update failed for ${row.id}: ${updateErr.message}`)
      }
      console.log(`  FAILED   ${label}  ${message}`)
    }
  }

  console.log(
    `\n${refined} refined, ${skipped} skipped, ${failed} failed` +
      (WRITE ? '' : '\n\nDry run — nothing written. Re-run with --write to apply.'),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

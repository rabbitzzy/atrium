/**
 * POST /api/capture-resolve — record what a student settled at the kiosk.
 *
 * The counterpart to an app's `Resolve` step. A student looked at a board, said
 * which move they played, and the app folded that answer into its result; this
 * writes that result back.
 *
 * Two things it deliberately cannot do:
 *
 *   - **Touch `ocr_json`.** The verbatim extraction is the record of what was
 *     actually on the paper. A student correcting their own handwriting does
 *     not change what they wrote, and the teacher's audit trail depends on
 *     that staying true. Only `refined_json` moves.
 *   - **Interpret the payload.** What a resolution means is the app's
 *     business. This route stores it.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { atrium } from './_lib/db'
import { appById } from './_lib/registry'

interface ResolveBody {
  captureId?: string
  kind?: string
  refined?: unknown
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { captureId, kind, refined } = (req.body ?? {}) as ResolveBody

  if (!captureId) return res.status(400).json({ error: 'captureId is required' })
  if (refined === undefined || refined === null) {
    return res.status(400).json({ error: 'refined is required' })
  }

  // An app that declares no refine step has no resolution to record either.
  // Checking here keeps a stray client from inventing refined output for a
  // kind that has no notion of it.
  const app = kind ? appById(kind) : undefined
  if (!app?.refine) {
    return res.status(400).json({ error: `kind ${kind ?? '(missing)'} has no refine step` })
  }

  try {
    const { data, error } = await atrium()
      .from('captures')
      .update({ refined_json: refined, refined_status: 'ok', refined_error: null })
      .eq('id', captureId)
      .eq('kind', app.id)
      .select('id')

    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'No such capture for that kind' })
    }

    return res.status(200).json({ captureId, ok: true })
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message })
  }
}

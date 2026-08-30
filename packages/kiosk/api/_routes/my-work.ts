/**
 * GET /api/my-work?studentId=… — one student's own captures, for the student.
 *
 * A sibling of `/api/captures` rather than a parameter on it, because the two
 * answer to different people. `/api/captures` is the admin surface: it takes an
 * optional student filter, and with none it returns the whole hub. That default
 * is exactly right for a teacher and exactly wrong here, so this route has no
 * such default — `studentId` is required, the filter is applied server-side, and
 * a child at the station can only ever ask for their own folder.
 *
 * It also returns less. The gallery needs a picture, a kind and a date; it has
 * no use for `ocr_json`, and shipping every past evaluation to a browser to
 * render six thumbnails would send a child's whole assessment history across the
 * wire to draw a grid.
 *
 * So there are two shapes here, and which one you get depends on whether you
 * asked about one capture:
 *
 *     ?studentId=…          → the lean list, for the grid
 *     ?studentId=…&id=…     → that one capture, with what the app made of it
 *
 * The payload only travels when a child has actually opened a piece of work,
 * which is also the only moment it can be read. `id` is filtered *alongside*
 * `student_id`, never instead of it: a capture id is guessable enough that it
 * must not be a way to read another student's row.
 *
 * Deliberately not admin-gated — students are the intended readers and hold no
 * token. What keeps it narrow is the required id and the trimmed columns, not a
 * secret. Note the consequence for local storage: the images themselves come
 * from `/api/capture-file`, which *is* gated, so with `CAPTURE_STORAGE=local`
 * and `ADMIN_TOKEN` set the thumbnails will not load. The Drive backend has no
 * such split, and that is the intended production configuration.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { atrium, rows } from '../_lib/db'

/** A term's worth of visits, and enough to fill a scrolling grid many times. */
const LIMIT = 120

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const studentId = typeof req.query['studentId'] === 'string' ? req.query['studentId'].trim() : ''
  if (!studentId) return res.status(400).json({ error: 'studentId is required' })

  const id = typeof req.query['id'] === 'string' ? req.query['id'].trim() : ''
  if (id) return one(res, studentId, id)

  try {
    const { data, error } = await atrium()
      .from('captures')
      .select('id, kind, storage_url, captured_at')
      .eq('student_id', studentId)
      .order('captured_at', { ascending: false })
      .limit(LIMIT)

    if (error) throw new Error(error.message)

    type CaptureRow = { id: string; kind: string; storage_url: string; captured_at: string }
    return res.status(200).json({
      captures: rows<CaptureRow>(data).map((r) => ({
        id: r.id,
        kind: r.kind,
        fileUrl: r.storage_url,
        capturedAt: r.captured_at,
      })),
    })
  } catch (err) {
    // Same reasoning as /api/students: when this fails it is the database that
    // is unreachable, and the kiosk itself is fine.
    return res.status(502).json({ error: (err as Error).message })
  }
}

/**
 * One capture, with whatever the app made of it.
 *
 * `ocr` follows the same rule `/api/capture` applies when a capture is fresh —
 * `refined_json ?? ocr_json` — so a scoresheet a student settled themselves
 * comes back the way they left it rather than as the machine's first reading.
 * Anything else would make My Work quietly disagree with the screen the child
 * saw at the time.
 */
async function one(res: VercelResponse, studentId: string, id: string) {
  try {
    const { data, error } = await atrium()
      .from('captures')
      .select('id, kind, storage_url, captured_at, ocr_json, ocr_status, ocr_error, refined_json')
      .eq('student_id', studentId)
      .eq('id', id)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return res.status(404).json({ error: 'Not found' })

    return res.status(200).json({
      capture: {
        id: data.id as string,
        kind: data.kind as string,
        fileUrl: data.storage_url as string,
        capturedAt: data.captured_at as string,
        ocrStatus: data.ocr_status as string,
        ocrError: (data.ocr_error as string | null) ?? null,
        ocr: data.refined_json ?? data.ocr_json ?? null,
      },
    })
  } catch (err) {
    return res.status(502).json({ error: (err as Error).message })
  }
}

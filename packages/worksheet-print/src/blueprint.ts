/**
 * What the Blueprint says about the Rooms a Card is for (BHCS-35).
 *
 * Read over HTTP rather than out of Postgres. `skill-graph` owns the Blueprint
 * and the planner, and `impl/architecture.md` is explicit that services are
 * deployables addressed by HTTP rather than imported — a second Supabase client
 * here would be a second place that knows how mastery works.
 */

import type { TargetRoom } from './problems.js'

const SKILL_GRAPH_URL = process.env['SKILL_GRAPH_URL'] ?? 'http://127.0.0.1:3001'

export class BlueprintError extends Error {}

interface KcRow {
  id: string
  label_en: string
  label_zh: string
  difficulty: number
  depth: number
}

async function getJson(path: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(`${SKILL_GRAPH_URL}${path}`, { headers: { accept: 'application/json' } })
  } catch {
    throw new BlueprintError(`skill-graph is unreachable at ${SKILL_GRAPH_URL}`)
  }
  if (!res.ok) throw new BlueprintError(`skill-graph answered ${res.status} for ${path}`)
  return res.json()
}

/**
 * Look up the Rooms a Card targets.
 *
 * Headings are rejected for the same reason attempts reject them: `math` is a
 * heading, and a Card asking a child to demonstrate "Mathematics" is not a
 * question. 004 guarantees only depth-2 Rooms are assessable, and this is the
 * door where that guarantee has to be re-checked, because the caller may be
 * passing ids from anywhere.
 */
export async function fetchRooms(kcIds: string[]): Promise<TargetRoom[]> {
  const all = (await getJson('/kcs?depth=2&limit=2000')) as { kcs?: KcRow[] }
  const byId = new Map((all.kcs ?? []).map((k) => [k.id, k]))

  const missing = kcIds.filter((id) => !byId.has(id))
  if (missing.length) {
    throw new BlueprintError(`not assessable Rooms in the Blueprint: ${missing.join(', ')}`)
  }

  return kcIds.map((id) => {
    const kc = byId.get(id)!
    return {
      id: kc.id,
      labelEn: kc.label_en,
      labelZh: kc.label_zh,
      difficulty: kc.difficulty,
    }
  })
}

export interface Landing {
  targetKcId: string
  reasonEn: string
  reasonZh: string
  outcome: string
}

/**
 * Ask the planner what this student should work on, for callers that have a
 * student but no opinion about which Room.
 *
 * Returns null when the planner declines to name one — everything mastered, or
 * every reachable Room walled off after four failures. Both are real answers
 * and neither should become a Card: printing something arbitrary because the
 * planner said "ask a teacher" is exactly the paper the Leaf economy exists to
 * stop.
 */
export async function fetchLanding(
  studentId: string,
  subject?: string,
): Promise<Landing | null> {
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : ''
  const plan = (await getJson(`/tasks/next/${encodeURIComponent(studentId)}${query}`)) as {
    targetKcId: string | null
    outcome: string
    reason?: { en: string; zh: string }
  }
  if (!plan.targetKcId) return null
  return {
    targetKcId: plan.targetKcId,
    outcome: plan.outcome,
    reasonEn: plan.reason?.en ?? '',
    reasonZh: plan.reason?.zh ?? '',
  }
}

export interface TaskRecord {
  id: string
  titleEn: string
  titleZh: string
  difficulty: number
  kcIds: string[]
  rubric: Record<string, unknown>
}

/**
 * Register the Card before it is printed (BHCS-37).
 *
 * The far end of the round trip. A task id in a QR header is only useful if
 * something can be looked up with it, and until now nothing wrote the row — a
 * scanned Card could say whose page it was and still leave the system with no
 * idea what had been asked on it.
 *
 * Called before the PDF is rendered, deliberately. A Card that reaches paper
 * without a task behind it is unscannable work: the child does it, hands it
 * back, and the station cannot grade it or award the Leaf.
 */
export async function registerTask(task: TaskRecord): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${SKILL_GRAPH_URL}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(task),
    })
  } catch {
    throw new BlueprintError(`skill-graph is unreachable at ${SKILL_GRAPH_URL}`)
  }
  if (!res.ok) {
    throw new BlueprintError(`could not record the Card: skill-graph answered ${res.status}`)
  }
}

export class InsufficientLeavesError extends Error {
  constructor(readonly balance: number) {
    super('insufficient_leaves')
  }
}

/** What this student may print, without spending anything. */
export async function readLeafBalance(studentId: string): Promise<number> {
  const out = (await getJson(`/students/${encodeURIComponent(studentId)}/leaves`)) as {
    balance?: number
  }
  return out.balance ?? 0
}

/**
 * Take the Leaf (BHCS-38).
 *
 * Called after the PDF exists and before it is handed back. That position is
 * the whole difficulty the ticket names: generation calls a model, rendering
 * launches a browser, and each can fail. Deduct before them and a child pays
 * for a Card that never came; deduct after delivery and a retry loop prints
 * free paper.
 *
 * By the time this runs, everything the service can actually observe has
 * succeeded — the problems exist, the task is registered, the bytes are in
 * hand. What remains unknown is whether paper comes out of a tray, and no
 * Vercel function can know that. That unknown is why the recovery is a teacher
 * grant rather than an automatic refund; see `008_leaf_ledger.sql`.
 */
export async function spendLeaf(studentId: string): Promise<number> {
  let res: Response
  try {
    res = await fetch(`${SKILL_GRAPH_URL}/students/${encodeURIComponent(studentId)}/leaves/spend`, {
      method: 'POST',
    })
  } catch {
    throw new BlueprintError(`skill-graph is unreachable at ${SKILL_GRAPH_URL}`)
  }
  if (res.status === 402) {
    const body = (await res.json()) as { balance?: number }
    throw new InsufficientLeavesError(body.balance ?? 0)
  }
  if (!res.ok) throw new BlueprintError(`could not spend a Leaf: skill-graph answered ${res.status}`)
  const body = (await res.json()) as { balance: number }
  return body.balance
}

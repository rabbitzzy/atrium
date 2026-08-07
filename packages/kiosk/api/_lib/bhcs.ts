/**
 * BHCS portal client — student profiles, over the portal's `cli-api`.
 *
 * BHCS owns student records (CLAUDE.md); Atrium stores the portal's student id
 * and nothing else. This calls the same versioned /v1 REST surface the `bhcs`
 * CLI uses, so Atrium holds an API key rather than a database credential and
 * sees only what the portal chooses to expose — no direct table access, and no
 * local copy of the roster to drift out of date.
 *
 * Every lookup is live, which is the point: a student added in the portal a
 * moment ago can check in, and one deactivated a moment ago cannot. There is
 * no sync step because there is nothing to sync.
 */

/** A student as the portal returns it. Fields we ignore are omitted. */
interface PortalStudent {
  id: string
  first_name: string
  last_name: string
  metadata: { grade?: string; school?: string } | null
}

/** A student as the kiosk wants it. */
export interface RosterStudent {
  id: string
  name: string
  /** Null whenever the portal has no usable grade — which is most rows. */
  grade: number | null
}

/**
 * Portal grade is free text typed by admins, not an enum: the live roster
 * holds "2", "6", "K", "Incoming K", "" and null. Normalise to a number the
 * planner can compare (K and TK both floor at 0, losing the rising/current
 * distinction, which nothing uses yet) and return null rather than guess when
 * it doesn't parse.
 *
 * Grade is a hint for pitching a student's first worksheet before there is any
 * BKT history — never something to gate on. Most rows don't have one.
 */
export function parseGrade(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase()
  if (!s) return null
  const digits = s.match(/\d+/)
  if (digits) return Number(digits[0])
  if (/\b(tk|k)\b/.test(s)) return 0
  return null
}

async function get<T>(path: string): Promise<T> {
  const base = process.env.BHCS_API_URL
  const key = process.env.BHCS_API_KEY
  if (!base || !key) {
    throw new Error('Missing env vars BHCS_API_URL / BHCS_API_KEY')
  }

  // The kiosk sits in a room where the network is not guaranteed, and a hung
  // fetch shows the student a spinner forever. Failing fast instead lets
  // CheckIn fall through to its type-a-name path, which is a worse experience
  // than the roster but a far better one than a frozen screen.
  const res = await fetch(`${base.replace(/\/$/, '')}/v1${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8000),
  })

  const text = await res.text()
  if (!res.ok) throw new Error(`BHCS portal ${res.status}: ${text.slice(0, 200)}`)
  return (JSON.parse(text) as { data: T }).data
}

export async function listActiveStudents(): Promise<RosterStudent[]> {
  // limit is required, not optional: the portal defaults to 100 and truncates
  // silently — no error, no has-more flag — so omitting it would one day drop
  // students off the end of the roster with nothing to show for it.
  const students = await get<PortalStudent[]>('/students?active=true&limit=1000')

  return students.map((s) => ({
    id: s.id,
    name: `${s.first_name} ${s.last_name}`.trim(),
    grade: parseGrade(s.metadata?.grade),
  }))
}

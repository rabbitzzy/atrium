/**
 * Tell a failed upstream call apart from an absent one.
 *
 * These are different problems with different fixes — "start the service" versus
 * "the service is broken, here is what it said" — and collapsing them into one
 * message sent someone hunting a network fault when skill-graph was running
 * fine and simply had no database credentials. Whatever the service said comes
 * back with it.
 *
 * Takes a call rather than a URL, because the call is no longer always a
 * request: skill-graph is mounted in this deployment and is normally dispatched
 * in-process (`_lib/skill-graph.ts`). What this function is actually about is
 * the reply, not how it was fetched.
 */

import { skillGraphWhere } from './skill-graph'

export async function relay(
  res: { status: (n: number) => { json: (b: unknown) => unknown } },
  call: () => Promise<Response>,
) {
  let upstream: Response
  try {
    upstream = await call()
  } catch {
    return res.status(503).json({
      error: 'skill_graph_unreachable',
      detail: `no answer from ${skillGraphWhere()}`,
    })
  }

  const text = await upstream.text()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    body = { error: 'skill_graph_error', detail: text.slice(0, 300) || upstream.statusText }
  }
  return res.status(upstream.status).json(body)
}

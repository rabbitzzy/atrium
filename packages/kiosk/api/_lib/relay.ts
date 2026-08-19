/**
 * Tell a failed upstream call apart from an absent one.
 *
 * These are different problems with different fixes — "start the service" versus
 * "the service is broken, here is what it said" — and collapsing them into one
 * message sent someone hunting a network fault when skill-graph was running
 * fine and simply had no database credentials. Whatever the service said comes
 * back with it.
 */
export async function relay(
  res: { status: (n: number) => { json: (b: unknown) => unknown } },
  url: string,
  init?: RequestInit,
) {
  let upstream: Response
  try {
    upstream = await fetch(url, init)
  } catch {
    return res.status(503).json({
      error: 'skill_graph_unreachable',
      detail: `nothing is listening at ${new URL(url).origin} — is it running?`,
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

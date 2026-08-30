/**
 * Reaching skill-graph, without leaving the process when it is already here.
 *
 * These routes are thin proxies onto the service that owns the Blueprint, the
 * student model and the Leaf ledger. They used to reach it the only way they
 * could — over HTTP at SKILL_GRAPH_URL — because it ran as a separate process.
 * Now it is mounted in the same function (`api/[...path].ts`), and a request to
 * its own public URL would be a genuinely bad way to ask itself a question:
 *
 *   - it leaves the datacentre and comes back, per call, and
 *     `student-state.ts` makes three of them for one screen;
 *   - it needs a URL, and the only correct one differs per deployment, so a
 *     hardcoded production host would quietly point every preview deploy at
 *     production data;
 *   - with Deployment Protection on it does not work at all — the deployment
 *     answers its own request with a 302 to Vercel's login page.
 *
 * So by default the call is dispatched straight into the mounted app: same
 * `Request`, same `Response`, no network, nothing to configure and nothing to
 * point at the wrong environment.
 *
 * SKILL_GRAPH_URL still wins when it is set, which is what keeps the service
 * runnable on its own — `pnpm dev` against a standalone :3001, or a future
 * deployment that really does put it elsewhere.
 */

import app from '../_routes/skill-graph.js'

/**
 * `path` is the service's own route, e.g. `/students/abc/leaves` — the mount
 * prefix belongs to whoever is doing the mounting, not to the caller.
 */
export function callSkillGraph(path: string, init?: RequestInit): Promise<Response> {
  const external = process.env['SKILL_GRAPH_URL']
  if (external) return fetch(`${external}${path}`, init)

  // The origin is arbitrary and never dialled; Request just needs an absolute
  // URL to parse. Hono may answer synchronously, so normalise to a promise.
  return Promise.resolve(app.fetch(new Request(`http://skill-graph${path}`, init)))
}

/** Where the calls are going, for error messages that name a real place. */
export function skillGraphWhere(): string {
  return process.env['SKILL_GRAPH_URL'] ?? 'the skill-graph mounted in this deployment'
}

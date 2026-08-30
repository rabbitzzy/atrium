/**
 * The skill-graph service, mounted inside the kiosk deployment.
 *
 * `skill-graph` is a Hono app that used to be reachable only as its own
 * process on :3001. On Vercel there is no second process to run, so the same
 * app is mounted here as a catch-all function and answers under
 * /api/skill-graph/* instead. Nothing about the service changes: the routes,
 * the BKT models and the Leaf ledger's atomicity all come from `app.ts`
 * unmodified, and running it standalone still works for `pnpm dev`.
 *
 * Callers are unaffected too. Every existing call site — the kiosk's own
 * proxies, worksheet-print's blueprint.ts, app-worksheet's server.ts — goes
 * through SKILL_GRAPH_URL, so folding the service in is a matter of pointing
 * that variable at this deployment rather than at localhost.
 *
 * The prefix is declared here rather than inside the service because it is a
 * fact about where the service is mounted, not about what it is: /students is
 * the route, /api/skill-graph is the address this particular deployment gives
 * it.
 */

import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import skillGraph from '@atrium/skill-graph/app'

const app = new Hono().route('/api/skill-graph', skillGraph)

export default handle(app)

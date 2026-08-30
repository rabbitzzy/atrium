/**
 * The skill-graph service, as a sub-app of the kiosk's API.
 *
 * `skill-graph` is a Hono app that used to be reachable only as its own process
 * on :3001. On Vercel there is no second process to run, so the same app is
 * mounted here and answers under /api/skill-graph/* instead. Nothing about the
 * service changes: the routes, the BKT models and the Leaf ledger's atomicity
 * all come from `app.ts` unmodified, and running it standalone still works for
 * `pnpm dev`.
 *
 * Callers are unaffected. Every existing call site — the kiosk's own proxies,
 * worksheet-print's blueprint.ts — goes through SKILL_GRAPH_URL, so folding the
 * service in is a matter of pointing that variable at this deployment.
 *
 * It is re-exported rather than adapted because it is already a Hono app; only
 * the Vercel-style handlers need `_lib/vercel-handler.ts`.
 */

export { default } from '@atrium/skill-graph/app'

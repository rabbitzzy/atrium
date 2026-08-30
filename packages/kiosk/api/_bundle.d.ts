/**
 * The type of the generated bundle (`scripts/build-api.mjs`).
 *
 * Committed, unlike `_bundle.js` itself, because `tsc --noEmit` runs before the
 * bundle is built — on a fresh checkout the file does not exist yet, and the
 * typecheck must not depend on a build artefact. This also states the contract
 * the entry point relies on: a web handler, which is what `hono/vercel`'s
 * `handle()` returns.
 */

declare const handler: (request: Request) => Response | Promise<Response>
export default handler

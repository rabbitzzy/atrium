/**
 * The type of the generated bundle (`scripts/build-api.mjs`).
 *
 * Committed, unlike `_bundle.js` itself, because `tsc --noEmit` runs before the
 * bundle is built — on a fresh checkout the file does not exist yet, and the
 * typecheck must not depend on a build artefact. This also states the contract
 * the entry point relies on: the Node handler pair Vercel invokes a function
 * with.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

declare const handler: (req: VercelRequest, res: VercelResponse) => unknown
export default handler

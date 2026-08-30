import { config } from 'dotenv'
// Every service reads the repo-root .env, the way worksheet-print already did.
// Without this, `pnpm dev` starts a process that answers /health and 500s on
// every route that touches the database — which looks like a network fault
// from the outside and is not one.
//
// This stays here rather than in app.ts because it is a local-development
// concern: on Vercel the environment arrives from the project settings and
// there is no repo root to find a .env in.
config({ path: new URL('../../../.env', import.meta.url).pathname })

import { serve } from '@hono/node-server'
import app from './app.js'

const PORT = Number(process.env['PORT'] ?? 3001)
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`skill-graph listening on :${PORT}`)
})

export default app

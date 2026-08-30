import { config } from 'dotenv'
// Local development reads the repo-root .env. On Vercel the environment comes
// from project settings and there is no repo root to find one in, which is why
// this lives here rather than in app.ts.
config({ path: new URL('../../../.env', import.meta.url).pathname })

import { serve } from '@hono/node-server'
import app from './app.js'

const PORT = Number(process.env['PORT'] ?? 3002)
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`worksheet listening on :${PORT}`)
})

export default app

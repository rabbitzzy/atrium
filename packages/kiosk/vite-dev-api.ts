import { loadEnv, type Connect, type Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/** Repo root — .env lives there, shared with the Python services. */
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..')
const ENV_FILE = path.join(REPO_ROOT, '.env')

/**
 * Keys applied from .env on the previous load, so a line deleted from the file
 * gets unset instead of lingering at its old value.
 *
 * Kept on globalThis rather than in module scope because a restart re-imports
 * this config module — module-level state would reset on exactly the reload
 * that needs it. The Node process is the same one throughout.
 */
const envStash = globalThis as typeof globalThis & { __atriumAppliedEnvKeys?: string[] }

/**
 * Load the repo-root .env into this process.
 *
 * Vite only exposes VITE_-prefixed vars, and only to the client. The api
 * handlers are server code reading process.env, so the root .env has to be
 * loaded into the dev process itself, and an empty prefix means "everything".
 *
 * The catch is that an empty prefix also opts into loadEnv's last step, which
 * copies all of process.env over the parsed file values so inline vars outrank
 * the file (vite/dist/node/chunks/dep-BK3b2jBa.js:34927 — `key.startsWith('')`
 * is true for every key). That is right on first load and wrong on reload: the
 * values we applied last time would outrank the edit, and the restart would
 * silently change nothing. So clear our own keys first and let the file win.
 *
 * Scanning for key names only — never values — keeps dotenv's parsing rules
 * (quoting, escapes, expansion) entirely in loadEnv's hands.
 */
function loadRootEnv(mode: string): void {
  const fileKeys = existsSync(ENV_FILE)
    ? [...readFileSync(ENV_FILE, 'utf-8').matchAll(/^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=/gm)].map(
        (m) => m[1],
      )
    : []

  // Union with last load's keys: a var deleted from the file is in one set but
  // not the other, and must be unset rather than left behind at its old value.
  const previous = envStash.__atriumAppliedEnvKeys ?? []
  for (const key of new Set([...previous, ...fileKeys])) delete process.env[key]

  Object.assign(process.env, loadEnv(mode, REPO_ROOT, ''))
  envStash.__atriumAppliedEnvKeys = fileKeys
}

/**
 * Serve the api/ directory during `vite dev`.
 *
 * In production Vercel turns each api/*.ts into a serverless function. Locally
 * the equivalent is `vercel dev`, which needs the Vercel CLI plus an
 * interactive login and project link — too much friction to stand between a
 * developer and a running app. This plugin loads the same handler modules
 * through Vite's SSR pipeline and adapts Node's req/res to the small slice of
 * the Vercel signature the handlers actually use.
 *
 * It is a dev convenience, not a reimplementation: the handlers are the real
 * ones, unchanged.
 */
export function devApi(): Plugin {
  return {
    name: 'atrium-dev-api',
    apply: 'serve',
    config(_, { mode }) {
      loadRootEnv(mode)
    },
    configureServer(server) {
      // Vite watches .env itself, but only inside envDir — which defaults to the
      // Vite root, packages/kiosk. Ours is at the repo root and is read once in
      // config() above, so without this a running server keeps serving the
      // environment it started with: no reload, no warning, and a failure that
      // reads as a code bug rather than a stale process. Restarting re-runs
      // config(), and so loadRootEnv(), which re-reads the file.
      server.watcher.add(ENV_FILE)
      const onEnvChange = (file: string) => {
        if (path.resolve(file) !== ENV_FILE) return
        server.config.logger.info('.env changed — restarting dev server', { timestamp: true })
        server.restart().catch((err) => {
          server.config.logger.error(`.env restart failed: ${(err as Error).message}`)
        })
      }
      server.watcher.on('change', onEnvChange)
      server.watcher.on('add', onEnvChange)

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/')) return next()

        /*
         * One dispatcher, the same one Vercel runs.
         *
         * This used to map /api/<name> onto api/<name>.ts and fall through when
         * no such file existed. That stopped working the moment the routes
         * moved into api/_routes/ behind a single function: every call fell
         * through to the SPA, the page got index.html where it expected JSON,
         * and the kiosk reported "Unexpected token '<'" for the roster. Going
         * through the entry point instead means local dev routes exactly as
         * production does, including the mounted skill-graph and worksheet
         * services, and cannot drift from it again.
         */
        const file = path.join(import.meta.dirname, 'api', '_entry.ts')
        if (!existsSync(file)) return next()

        try {
          const mod = (await server.ssrLoadModule(file)) as {
            default: (req: unknown, res: unknown) => Promise<void> | void
          }
          await mod.default(await adaptRequest(req, url), adaptResponse(res))
        } catch (err) {
          server.ssrFixStacktrace(err as Error)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: (err as Error).message }))
        }
      })
    },
  }
}

async function adaptRequest(req: Connect.IncomingMessage, url: URL) {
  const query: Record<string, string> = {}
  url.searchParams.forEach((value, key) => {
    query[key] = value
  })

  let body: unknown = undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const raw = Buffer.concat(chunks).toString('utf-8')
    if (raw) {
      try {
        body = JSON.parse(raw)
      } catch {
        body = raw
      }
    }
  }

  return Object.assign(req as IncomingMessage, { query, body })
}

function adaptResponse(res: ServerResponse) {
  return Object.assign(res, {
    status(code: number) {
      res.statusCode = code
      return this
    },
    json(payload: unknown) {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(payload))
      return this
    },
  })
}

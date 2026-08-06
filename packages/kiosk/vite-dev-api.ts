import { loadEnv, type Connect, type Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync } from 'node:fs'
import path from 'node:path'

/** Repo root — .env lives there, shared with the Python services. */
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..')

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
      // Vite only exposes VITE_-prefixed vars, and only to the client. The api
      // handlers are server code reading process.env, so load the root .env
      // into the dev process itself. An empty prefix means "everything".
      Object.assign(process.env, loadEnv(mode, REPO_ROOT, ''))
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/')) return next()

        // Only claim routes we actually have a file for, so the existing
        // proxies to the standalone Python/TS services still work.
        const name = url.pathname.slice('/api/'.length)
        const file = path.join(import.meta.dirname, 'api', `${name}.ts`)
        if (!name || name.includes('..') || !existsSync(file)) return next()

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

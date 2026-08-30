/**
 * Bundle the API into one file, ahead of Vercel's own compilation.
 *
 * See api/[...path].ts for why. In short: Vercel compiles this package's
 * TypeScript but not the workspace packages it imports, several of which export
 * raw .ts, so Node is handed an import it cannot resolve. esbuild resolves them
 * exactly as vite and tsx do and inlines the result.
 *
 * Everything is bundled, dependencies included. The alternative — marking
 * node_modules external — would leave the same class of resolution question
 * open at runtime, which is the thing this script exists to close.
 */

import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))

const result = await build({
  entryPoints: [path.join(here, '..', 'api', '_entry.ts')],
  outfile: path.join(here, '..', 'api', '_bundle.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  // Matches the Node version the project runs on Vercel.
  target: 'node22',
  // The functions are cold-started, not read; a source map costs nothing to
  // ship and makes a production stack trace name a real line.
  sourcemap: 'inline',
  logLevel: 'warning',
  metafile: true,
})

const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0
console.log(`api/_bundle.js  ${(bytes / 1024).toFixed(0)} kB`)

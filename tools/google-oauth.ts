/**
 * One-time helper: mint a Google Drive refresh token.
 *
 * Run once per machine/account, paste the result into .env, and never think
 * about it again — refresh tokens do not expire unless revoked or unused for
 * six months.
 *
 *   pnpm --filter @atrium/tools oauth
 *
 * Prerequisites (Google Cloud Console, ~5 minutes):
 *   1. Create or pick a project
 *   2. APIs & Services → Library → enable "Google Drive API"
 *   3. APIs & Services → OAuth consent screen → External → add yourself as a
 *      Test user (keeps the app in Testing; no verification review needed)
 *   4. Credentials → Create credentials → OAuth client ID → Web application
 *      → Authorized redirect URI: http://localhost:4321/callback
 *   5. Put the client ID and secret in .env, then run this script
 */

import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { config } from 'dotenv'

config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') })

const PORT = 4321
const REDIRECT_URI = `http://localhost:${PORT}/callback`

// drive.file scopes access to files this app creates — it cannot read the rest
// of the operator's Drive. Least privilege, and it keeps the consent screen
// honest about what Atrium touches.
//
// The catch: under this scope a folder you create by hand in the Drive UI is
// invisible to the app. So this script creates the root folder itself, which
// makes every capture folder beneath it app-created and therefore reachable.
const SCOPE = 'https://www.googleapis.com/auth/drive.file'

const ROOT_FOLDER_NAME = 'Atrium Captures'

const clientId = process.env['GOOGLE_CLIENT_ID']
const clientSecret = process.env['GOOGLE_CLIENT_SECRET']

if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.')
  process.exit(1)
}

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    // Both are required to get a refresh token back: offline for the grant,
    // consent to force re-issue even if this account already authorized once.
    access_type: 'offline',
    prompt: 'consent',
  })

console.log('\nOpen this URL in your browser:\n')
console.log(authUrl)
console.log('\nWaiting for the redirect…\n')

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  if (url.pathname !== '/callback') {
    res.writeHead(404).end()
    return
  }

  const code = url.searchParams.get('code')
  if (!code) {
    res.writeHead(400).end(`Authorization failed: ${url.searchParams.get('error') ?? 'no code'}`)
    server.close()
    return
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })

  const data = (await tokenRes.json()) as {
    refresh_token?: string
    access_token?: string
    error_description?: string
  }

  if (!data.refresh_token || !data.access_token) {
    res.writeHead(500).end('No refresh token returned — see terminal.')
    console.error('\nToken exchange failed:', data.error_description ?? JSON.stringify(data))
    server.close()
    process.exit(1)
  }

  // Create the root folder now, while we hold a fresh access token. Doing it
  // here rather than asking the operator to make one by hand is what keeps the
  // narrow drive.file scope workable.
  const folderRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${data.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: ROOT_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  })

  if (!folderRes.ok) {
    res.writeHead(500).end('Folder creation failed — see terminal.')
    console.error(`\nCould not create the root folder (${folderRes.status}):`, await folderRes.text())
    server.close()
    process.exit(1)
  }

  const folder = (await folderRes.json()) as { id: string }

  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end('<h2>Done.</h2><p>Values printed in your terminal. You can close this tab.</p>')

  console.log('Add these to .env:\n')
  console.log(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}`)
  console.log(`GOOGLE_DRIVE_ROOT_FOLDER_ID=${folder.id}\n`)
  console.log(`Created "${ROOT_FOLDER_NAME}" in your Drive:`)
  console.log(`https://drive.google.com/drive/folders/${folder.id}\n`)

  server.close()
})

server.listen(PORT)

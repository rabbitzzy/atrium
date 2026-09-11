/**
 * One-time helper: mint a Google Drive refresh token.
 *
 * Run once per account, paste the result into .env and the deployment, and it
 * lasts until revoked or left unused for six months — *if the consent screen
 * is published* (step 3). Left in Testing, Google expires every refresh token
 * it issues after seven days, and the station finds out on its next capture:
 * "invalid_grant: Token has been expired or revoked."
 *
 *   pnpm --filter @atrium/tools oauth
 *
 * Re-running it is also the recovery from that error. It keeps the root folder
 * GOOGLE_DRIVE_ROOT_FOLDER_ID already names when the new token can see it, so a
 * re-mint does not split captures across two folders.
 *
 * Prerequisites (Google Cloud Console, ~5 minutes):
 *   1. Create or pick a project
 *   2. APIs & Services → Library → enable "Google Drive API"
 *   3. Google Auth Platform → Audience → External, then Publish app. drive.file
 *      is a non-sensitive scope, so publishing needs no verification review.
 *      A token minted while the app was still in Testing keeps its seven-day
 *      life after you publish — mint again once it is In production.
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
const FILES_URL = 'https://www.googleapis.com/drive/v3/files'

const clientId = process.env['GOOGLE_CLIENT_ID']
const clientSecret = process.env['GOOGLE_CLIENT_SECRET']

if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.')
  process.exit(1)
}

/**
 * The folder captures go into: the one .env already names, if this token can
 * see it, otherwise a new one.
 *
 * A re-mint that always created a folder would hand back a new id, and pasting
 * it would leave a teacher browsing two "Atrium Captures" with the work split
 * between them. Rows would still read — they hold file ids, not paths — but the
 * Drive a teacher opens would be wrong.
 *
 * drive.file hides another account's folder entirely, so minting as a new
 * account (BHCS-102) cannot see the old one and falls through to creating its
 * own — which is what that migration wants.
 */
async function rootFolder(accessToken: string): Promise<{ id: string; reused: boolean }> {
  const auth = { Authorization: `Bearer ${accessToken}` }

  const existing = process.env['GOOGLE_DRIVE_ROOT_FOLDER_ID']
  if (existing) {
    const res = await fetch(`${FILES_URL}/${encodeURIComponent(existing)}?fields=id,trashed`, { headers: auth })
    if (res.ok) {
      const file = (await res.json()) as { id: string; trashed: boolean }
      if (!file.trashed) return { id: file.id, reused: true }
    }
    console.warn(
      `GOOGLE_DRIVE_ROOT_FOLDER_ID is not usable by this token (${res.ok ? 'in the trash' : res.status}) — creating a new folder.`,
    )
  }

  const res = await fetch(`${FILES_URL}?fields=id`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: ROOT_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  })
  if (!res.ok) throw new Error(`Could not create the root folder (${res.status}): ${await res.text()}`)
  return { id: ((await res.json()) as { id: string }).id, reused: false }
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

  // Settle the root folder now, while we hold a fresh access token. Creating it
  // here rather than asking the operator to make one by hand is what keeps the
  // narrow drive.file scope workable.
  let folder: { id: string; reused: boolean }
  try {
    folder = await rootFolder(data.access_token)
  } catch (err) {
    res.writeHead(500).end('Folder setup failed — see terminal.')
    console.error(`\n${(err as Error).message}`)
    server.close()
    process.exit(1)
  }

  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end('<h2>Done.</h2><p>Values printed in your terminal. You can close this tab.</p>')

  console.log('Add these to .env, and to the deployment (Vercel: Production and Preview, then redeploy):\n')
  console.log(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}`)
  console.log(`GOOGLE_DRIVE_ROOT_FOLDER_ID=${folder.id}\n`)
  console.log(folder.reused ? 'Kept the existing root folder:' : `Created "${ROOT_FOLDER_NAME}" in your Drive:`)
  console.log(`https://drive.google.com/drive/folders/${folder.id}\n`)

  server.close()
})

server.listen(PORT)

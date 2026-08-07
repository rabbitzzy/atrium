/**
 * Google Drive persistence.
 *
 * Auth is a long-lived OAuth refresh token belonging to a real Google account
 * (not a service account). Service accounts have no Drive storage quota of
 * their own, so uploading as one requires a Workspace Shared Drive — which a
 * consumer @gmail.com account cannot create. The refresh token avoids that
 * entirely: files are owned by, and count against, the operator's own Drive.
 *
 * Run `pnpm tsx tools/google-oauth.ts` once to mint the refresh token.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'
const FILES_URL = 'https://www.googleapis.com/drive/v3/files'

/** Access tokens live ~1h. Serverless instances are reused, so cache in module scope. */
let cachedToken: { value: string; expiresAt: number } | null = null

/** folderName -> folderId. Saves a list() round-trip on every capture. */
const folderCache = new Map<string, string>()

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env var ${name}`)
  return value
}

async function accessToken(): Promise<string> {
  // 60s skew so we never hand out a token that expires mid-upload.
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: required('GOOGLE_CLIENT_ID'),
      client_secret: required('GOOGLE_CLIENT_SECRET'),
      refresh_token: required('GOOGLE_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    throw new Error(`Google token refresh failed (${res.status}): ${await res.text()}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return cachedToken.value
}

async function driveFetch(url: string, init: RequestInit): Promise<Response> {
  const token = await accessToken()
  const res = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`Drive API ${init.method ?? 'GET'} ${url} failed (${res.status}): ${await res.text()}`)
  }
  return res
}

/**
 * Find or create a subfolder of GOOGLE_DRIVE_ROOT_FOLDER_ID.
 *
 * One folder per capture kind (worksheet/, chess/, doodle/) so a teacher can
 * open Drive and browse by category without any Atrium UI.
 */
async function ensureFolder(name: string): Promise<string> {
  const cached = folderCache.get(name)
  if (cached) return cached

  const root = required('GOOGLE_DRIVE_ROOT_FOLDER_ID')
  const query = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    `'${root}' in parents`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    'trashed = false',
  ].join(' and ')

  const listed = await driveFetch(`${FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id)`, {
    method: 'GET',
  })
  const { files } = (await listed.json()) as { files: { id: string }[] }

  let id = files[0]?.id
  if (!id) {
    const created = await driveFetch(`${FILES_URL}?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [root],
      }),
    })
    id = ((await created.json()) as { id: string }).id
  }

  folderCache.set(name, id)
  return id
}

export interface UploadedFile {
  fileId: string
  url: string
}

/**
 * Upload an image to Drive and return a pointer to it.
 *
 * Reached through storage.ts rather than called directly, so the pipeline
 * stays backend-agnostic.
 *
 * Uses Drive's multipart upload (metadata + bytes in one request), which is
 * the right choice under ~5MB. The kiosk downscales before sending, so
 * captures land well inside that.
 */
export async function uploadToDrive(args: {
  bytes: Buffer
  filename: string
  mimeType: string
  folder: string
}): Promise<UploadedFile> {
  const parent = await ensureFolder(args.folder)
  const boundary = `atrium-${Date.now()}-${Math.random().toString(36).slice(2)}`

  const metadata = JSON.stringify({ name: args.filename, parents: [parent] })
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: ${args.mimeType}\r\n\r\n`,
    ),
    args.bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])

  const res = await driveFetch(`${UPLOAD_URL}?uploadType=multipart&fields=id,webViewLink`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: body as unknown as BodyInit,
  })

  const file = (await res.json()) as { id: string; webViewLink?: string }
  return {
    fileId: file.id,
    url: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
  }
}

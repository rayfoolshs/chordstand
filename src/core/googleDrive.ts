/**
 * Google Drive backup support.
 *
 * The app stays static and backend-free: this module uses the OAuth 2.0
 * authorization code flow with PKCE (the public-client variant for SPAs), so
 * the user signs in on Google's own page and the app never sees a password.
 * The `drive.file` scope only lets the app see files it created, so the rest
 * of the user's Drive is untouched.
 *
 * The client ID and secret are build-time values (VITE_GOOGLE_CLIENT_ID and
 * VITE_GOOGLE_CLIENT_SECRET). Google's "Web application" OAuth client type
 * requires the secret in the token exchange, even though a static app cannot
 * keep it truly private. The client is origin-specific: the Google Cloud OAuth
 * client must list the app's origin and redirect URI as authorized.
 */

const OAUTH_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const OAUTH_TOKEN = 'https://oauth2.googleapis.com/token'
const OAUTH_REVOKE = 'https://oauth2.googleapis.com/revoke'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const DRIVE_FOLDER_NAME = 'Chordstand'
export const DRIVE_BACKUP_PREFIX = 'chordstand-backup-'
/** Dispatched after the redirect callback stores a token. */
export const DRIVE_TOKEN_EVENT = 'chordstand:drive-token'

const TOKEN_KEY = 'chordstand.drive.token.v1'
const PENDING_KEY = 'chordstand.drive.pending.v1'
const ERROR_KEY = 'chordstand.drive.error.v1'

export interface DriveToken {
  accessToken: string
  /** Epoch milliseconds. */
  expiresAt: number
  /** Long-lived token returned by the offline flow. */
  refreshToken?: string
}

export interface DriveBackupFile {
  id: string
  name: string
  size?: number
  modifiedTime?: string
  webViewLink?: string
}

export class DriveError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'DriveError'
    this.status = status
  }
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface PendingSignIn {
  clientId: string
  clientSecret: string
  state: string
  codeVerifier: string
  redirectUri: string
}

function tokenStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

function readToken(): DriveToken | null {
  const storage = tokenStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(TOKEN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DriveToken
    if (typeof parsed.accessToken !== 'string' || typeof parsed.expiresAt !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export function storeDriveToken(token: DriveToken | null): void {
  const storage = tokenStorage()
  if (!storage) return
  try {
    if (token) storage.setItem(TOKEN_KEY, JSON.stringify(token))
    else storage.removeItem(TOKEN_KEY)
  } catch {
    // Storage can be unavailable in private browsing.
  }
}

/** The access token, or null when it is missing or expired. */
export function getDriveToken(): DriveToken | null {
  const token = readToken()
  if (!token) return null
  if (token.expiresAt < Date.now() + 60_000) {
    tokenStorage()?.removeItem(TOKEN_KEY)
    return null
  }
  return token
}

function storePending(pending: PendingSignIn): void {
  const storage = tokenStorage()
  if (!storage) return
  try {
    storage.setItem(PENDING_KEY, JSON.stringify(pending))
  } catch {
    // Ignore.
  }
}

function readPending(): PendingSignIn | null {
  const storage = tokenStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(PENDING_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PendingSignIn
  } catch {
    return null
  }
}

function clearPending(): void {
  tokenStorage()?.removeItem(PENDING_KEY)
}

function storeDriveError(message: string): void {
  const storage = tokenStorage()
  if (!storage) return
  try {
    storage.setItem(ERROR_KEY, message)
  } catch {
    // Ignore.
  }
}

/** Take and clear the last sign-in error, if the redirect callback stored one. */
export function takeDriveError(): string | null {
  const storage = tokenStorage()
  if (!storage) return null
  try {
    const message = storage.getItem(ERROR_KEY)
    if (message) storage.removeItem(ERROR_KEY)
    return message
  } catch {
    return null
  }
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomString(length = 32): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return new Uint8Array(digest)
}

/** The app's own URL, without the OAuth query or hash. Register this as the redirect URI. */
function redirectUri(): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  return url.toString()
}

/**
 * Send the browser to Google's consent page. The app returns to the same URL
 * with `?code=...&state=...`; `handleDriveRedirect()` finishes the exchange.
 */
export async function startDriveSignIn(clientId: string, clientSecret: string): Promise<void> {
  const id = clientId.trim()
  if (!id) throw new DriveError('Add a Google Drive client ID first.', 0)
  if (typeof window === 'undefined') throw new DriveError('Google Drive is only available in a browser.', 0)

  const state = randomString(24)
  const codeVerifier = randomString(48)
  const codeChallenge = base64Url(await sha256(codeVerifier))
  const uri = redirectUri()

  storePending({ clientId: id, clientSecret: clientSecret.trim(), state, codeVerifier, redirectUri: uri })

  const url = new URL(OAUTH_AUTH)
  url.searchParams.set('client_id', id)
  url.searchParams.set('redirect_uri', uri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', DRIVE_SCOPE)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', state)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  window.location.assign(url.toString())
}

/**
 * Complete the redirect flow. Called on app start; returns null when the URL
 * is not an OAuth callback. Errors are stored so the Drive panel can show them.
 */
export async function handleDriveRedirect(): Promise<DriveToken | null> {
  if (typeof window === 'undefined') return null

  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  if (!code && !error) return null

  // Clear the OAuth parameters so a reload does not replay the code.
  url.search = ''
  url.hash = ''
  window.history.replaceState(null, '', url.toString())

  const pending = readPending()
  if (!pending) return null

  if (error) {
    clearPending()
    storeDriveError(
      error === 'access_denied'
        ? 'Google Drive sign-in was cancelled.'
        : `Google Drive sign-in failed (${error}).`,
    )
    return null
  }

  if (!state || state !== pending.state) {
    clearPending()
    storeDriveError('Google Drive sign-in returned an unexpected state. Try again.')
    return null
  }

  try {
    const response = await fetch(OAUTH_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: pending.clientId,
        client_secret: pending.clientSecret,
        code: code!,
        code_verifier: pending.codeVerifier,
        redirect_uri: pending.redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new DriveError(`Google Drive token exchange failed: ${text}`, response.status)
    }
    const data = (await response.json()) as TokenResponse
    const token: DriveToken = {
      accessToken: data.access_token ?? '',
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      refreshToken: data.refresh_token,
    }
    storeDriveToken(token)
    clearPending()
    window.dispatchEvent(new Event(DRIVE_TOKEN_EVENT))
    return token
  } catch (error) {
    clearPending()
    storeDriveError(driveErrorMessage(error))
    return null
  }
}

/** Refresh the access token with the long-lived refresh token. */
export async function refreshDriveToken(
  token: DriveToken,
  clientId: string,
  clientSecret: string,
): Promise<DriveToken> {
  if (!token.refreshToken) throw new DriveError('Google Drive sign-in expired. Connect again.', 401)
  const response = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId.trim(),
      client_secret: clientSecret.trim(),
      refresh_token: token.refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new DriveError(`Google Drive refresh failed: ${text}`, response.status)
  }
  const data = (await response.json()) as TokenResponse
  const next: DriveToken = {
    accessToken: data.access_token ?? '',
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    refreshToken: token.refreshToken,
  }
  storeDriveToken(next)
  return next
}

/** A valid token, refreshing it when possible; otherwise throws a 401. */
export async function ensureDriveToken(clientId: string, clientSecret: string): Promise<DriveToken> {
  const token = getDriveToken()
  if (token) return token
  const stored = readToken()
  if (stored?.refreshToken) {
    try {
      return await refreshDriveToken(stored, clientId, clientSecret)
    } catch {
      // Fall through to the sign-in error.
    }
  }
  throw new DriveError('Google Drive sign-in expired. Connect again.', 401)
}

/** Revoke the token and forget it locally. */
export async function revokeDriveToken(token: DriveToken): Promise<void> {
  const value = token.refreshToken ?? token.accessToken
  try {
    await fetch(`${OAUTH_REVOKE}?token=${encodeURIComponent(value)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
  } catch {
    // Revoking is best effort; the token is still dropped locally.
  }
  storeDriveToken(null)
}

function authHeaders(token: DriveToken): Record<string, string> {
  return { Authorization: `Bearer ${token.accessToken}` }
}

async function driveError(response: Response): Promise<DriveError> {
  const fallback = `Google Drive returned ${response.status} ${response.statusText}.`.trim()
  try {
    const data = (await response.json()) as { error?: { message?: string } }
    if (data.error?.message) return new DriveError(data.error.message, response.status)
  } catch {
    // Keep the status-based message.
  }
  return new DriveError(fallback, response.status)
}

async function findOrCreateFolder(token: DriveToken): Promise<string> {
  const query = `name = '${DRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  const list = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`,
    { headers: authHeaders(token) },
  )
  if (!list.ok) throw await driveError(list)
  const data = (await list.json()) as { files?: Array<{ id: string }> }
  if (data.files?.[0]?.id) return data.files[0].id

  const create = await fetch(`${DRIVE_API}/files?fields=id,name`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  })
  if (!create.ok) throw await driveError(create)
  const created = (await create.json()) as { id: string }
  return created.id
}

function makeBoundary(): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(16).slice(2)
  return `chordstand_${random}`
}

/** Upload a zip to the Chordstand folder and return its Drive metadata. */
export async function driveBackup(
  token: DriveToken,
  bytes: Uint8Array,
  fileName: string,
): Promise<DriveBackupFile> {
  const folderId = await findOrCreateFolder(token)
  const boundary = makeBoundary()
  const metadata = JSON.stringify({
    name: fileName,
    mimeType: 'application/zip',
    parents: [folderId],
  })
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    metadata,
    `\r\n--${boundary}\r\nContent-Type: application/zip\r\n\r\n`,
    bytes as BlobPart,
    `\r\n--${boundary}--\r\n`,
  ])

  const response = await fetch(
    `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,name,size,modifiedTime,webViewLink`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  )
  if (!response.ok) throw await driveError(response)
  return (await response.json()) as DriveBackupFile
}

/** List backups this app created, newest first. */
export async function listDriveBackups(token: DriveToken): Promise<DriveBackupFile[]> {
  const query = `name contains '${DRIVE_BACKUP_PREFIX}' and trashed = false`
  const response = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&orderBy=${encodeURIComponent('modifiedTime desc')}&pageSize=20&fields=files(id,name,size,modifiedTime,webViewLink)`,
    { headers: authHeaders(token) },
  )
  if (!response.ok) throw await driveError(response)
  const data = (await response.json()) as { files?: DriveBackupFile[] }
  return data.files ?? []
}

/** Download a backup's bytes. */
export async function downloadDriveBackup(token: DriveToken, fileId: string): Promise<Uint8Array> {
  const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: authHeaders(token),
  })
  if (!response.ok) throw await driveError(response)
  return new Uint8Array(await response.arrayBuffer())
}

/** Delete a backup from Drive. */
export async function deleteDriveBackup(token: DriveToken, fileId: string): Promise<void> {
  const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!response.ok && response.status !== 404) throw await driveError(response)
}

/** Turn a Drive error into a sentence the player can act on. */
export function driveErrorMessage(error: unknown): string {
  if (error instanceof DriveError) {
    if (error.status === 401) return 'Google Drive sign-in expired. Connect again.'
    if (error.status === 403) {
      return 'Google Drive refused the request. Enable the Drive API and check the drive.file scope.'
    }
    if (error.status === 404) return 'That backup is no longer in Google Drive.'
    return error.message
  }
  if (error instanceof Error) return error.message
  return 'Could not reach Google Drive.'
}

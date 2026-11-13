import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DriveError,
  driveBackup,
  driveErrorMessage,
  downloadDriveBackup,
  getDriveToken,
  handleDriveRedirect,
  listDriveBackups,
  startDriveSignIn,
  takeDriveError,
  type DriveToken,
} from './googleDrive'

const token: DriveToken = { accessToken: 'token', expiresAt: Date.now() + 60_000 }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function createStorage() {
  const map = new Map<string, string>()
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
    clear: () => map.clear(),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size
    },
  }
  vi.stubGlobal('sessionStorage', storage)
  return { storage, map }
}

function createWindow(href: string) {
  const assign = vi.fn()
  const replaceState = vi.fn()
  const dispatchEvent = vi.fn()
  vi.stubGlobal('window', {
    location: { href, assign },
    history: { replaceState },
    dispatchEvent,
  })
  return { assign, replaceState, dispatchEvent }
}

const cryptoMock = {
  getRandomValues: (array: Uint8Array) => {
    array.fill(1)
    return array
  },
  subtle: {
    digest: async () => new Uint8Array(32).fill(2).buffer,
  },
  randomUUID: () => '00000000-0000-0000-0000-000000000000',
}

describe('googleDrive', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts a PKCE sign-in and redirects to Google', async () => {
    const { assign } = createWindow('https://app.test/')
    const { map } = createStorage()
    vi.stubGlobal('crypto', cryptoMock)

    await startDriveSignIn('client-id', 'client-secret')

    expect(assign).toHaveBeenCalledTimes(1)
    const url = new URL(assign.mock.calls[0][0] as string)
    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.searchParams.get('client_id')).toBe('client-id')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.test/')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).toBeTruthy()
    expect(map.get('chordstand.drive.pending.v1')).toBeTruthy()
  })

  it('exchanges the redirect code for a token', async () => {
    const { replaceState } = createWindow('https://app.test/?code=abc&state=state-1')
    const { map } = createStorage()
    map.set(
      'chordstand.drive.pending.v1',
      JSON.stringify({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        state: 'state-1',
        codeVerifier: 'verifier',
        redirectUri: 'https://app.test/',
      }),
    )
    const fetchMock = vi.fn().mockResolvedValueOnce(
      json({ access_token: 'token', refresh_token: 'refresh', expires_in: 3600 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await handleDriveRedirect()

    expect(result?.accessToken).toBe('token')
    expect(result?.refreshToken).toBe('refresh')
    expect(replaceState).toHaveBeenCalled()
    expect(map.get('chordstand.drive.token.v1')).toBeTruthy()
    expect(map.has('chordstand.drive.pending.v1')).toBe(false)
    const body = fetchMock.mock.calls[0][1] as RequestInit
    expect(String(body.body)).toContain('client_secret=client-secret')
  })

  it('ignores a URL that is not a redirect callback', async () => {
    createWindow('https://app.test/')
    createStorage()
    expect(await handleDriveRedirect()).toBeNull()
  })

  it('rejects a mismatched redirect state', async () => {
    createWindow('https://app.test/?code=abc&state=wrong')
    const { map } = createStorage()
    map.set(
      'chordstand.drive.pending.v1',
      JSON.stringify({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        state: 'state-1',
        codeVerifier: 'verifier',
        redirectUri: 'https://app.test/',
      }),
    )

    expect(await handleDriveRedirect()).toBeNull()
    expect(takeDriveError()).toContain('unexpected state')
  })

  it('creates the folder and uploads the backup', async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(json({ files: [] }))
      .mockResolvedValueOnce(json({ id: 'folder-1' }))
      .mockResolvedValueOnce(json({ id: 'file-1', name: 'chordstand-backup-2026-11-13.zip' }))
    vi.stubGlobal('fetch', fetchMock)

    const file = await driveBackup(token, new Uint8Array([1, 2, 3]), 'chordstand-backup-2026-11-13.zip')

    expect(file.id).toBe('file-1')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [url, init] = fetchMock.mock.calls[2] as [string, RequestInit]
    expect(url).toContain('/upload/drive/v3/files?uploadType=multipart')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer token' })
    expect(init.body).toBeInstanceOf(Blob)
  })

  it('reuses an existing folder', async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(json({ files: [{ id: 'folder-1' }] }))
      .mockResolvedValueOnce(json({ id: 'file-2' }))
    vi.stubGlobal('fetch', fetchMock)

    await driveBackup(token, new Uint8Array([1]), 'backup.zip')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('lists backups newest first', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      json({ files: [{ id: 'file-1', name: 'chordstand-backup-2026-11-13.zip' }] }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const files = await listDriveBackups(token)
    expect(files).toHaveLength(1)
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('orderBy=modifiedTime%20desc')
    expect(url).toContain('chordstand-backup-')
  })

  it('downloads a backup', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const bytes = await downloadDriveBackup(token, 'file-1')
    expect(Array.from(bytes)).toEqual([1, 2, 3])
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/files/file-1?alt=media')
  })

  it('surfaces Drive errors with a readable message', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ error: { message: 'Insufficient permissions' } }, 403))
    vi.stubGlobal('fetch', fetchMock)

    await expect(listDriveBackups(token)).rejects.toBeInstanceOf(DriveError)
    expect(driveErrorMessage(new DriveError('Insufficient permissions', 403))).toContain('Drive API')
    expect(driveErrorMessage(new DriveError('expired', 401))).toContain('expired')
    expect(driveErrorMessage(new DriveError('missing', 404))).toContain('no longer')
  })

  it('returns null when no token is stored', () => {
    expect(getDriveToken()).toBeNull()
  })
})

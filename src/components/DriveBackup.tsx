import { useEffect, useState } from 'react'
import { buildBackupZip, readImportFiles } from '../core/import'
import { backupFileName, describeBackupAge } from '../core/storage'
import {
  DRIVE_TOKEN_EVENT,
  deleteDriveBackup,
  driveBackup,
  driveErrorMessage,
  downloadDriveBackup,
  ensureDriveToken,
  getDriveToken,
  listDriveBackups,
  revokeDriveToken,
  startDriveSignIn,
  takeDriveError,
  type DriveBackupFile,
  type DriveToken,
} from '../core/googleDrive'
import type { Setlist, Song } from '../core/types'
import { useSettings } from '../store/useSettings'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
const GOOGLE_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET ?? ''

interface DriveBackupProps {
  songs: Song[]
  setlists: Setlist[]
}

/**
 * Optional Google Drive section for Storage & backups.
 *
 * The app ships with a Google Cloud OAuth client ID (set at build time), so the
 * player only ever sees "Sign in with Google Drive". The app then sends the
 * browser to Google's consent page (OAuth 2.0 + PKCE, no popup) and uploads or
 * downloads the same backup zip that the local "Save full backup" button
 * produces.
 */
export function DriveBackup({ songs, setlists }: DriveBackupProps) {
  const lastDriveBackupAt = useSettings((state) => state.lastDriveBackupAt)
  const markDriveBackup = useSettings((state) => state.markDriveBackup)
  const restoreBackup = useStore((state) => state.restoreBackup)

  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [showRestore, setShowRestore] = useState(false)
  const [backups, setBackups] = useState<DriveBackupFile[] | null>(null)

  useEffect(() => {
    const sync = () => setConnected(Boolean(getDriveToken()))
    sync()
    window.addEventListener(DRIVE_TOKEN_EVENT, sync)
    return () => window.removeEventListener(DRIVE_TOKEN_EVENT, sync)
  }, [])

  useEffect(() => {
    const error = takeDriveError()
    if (error) setNotice(error)
  }, [])

  const ensureToken = async (): Promise<DriveToken> =>
    ensureDriveToken(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)

  const connect = async () => {
    setBusy(true)
    setNotice('')
    try {
      await startDriveSignIn(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
    } catch (error) {
      setNotice(driveErrorMessage(error))
      setBusy(false)
    }
  }

  const backUp = async () => {
    setBusy(true)
    setNotice('')
    try {
      const token = await ensureToken()
      // Let the "Backing up…" label paint before zipping a large library.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const bytes = buildBackupZip(songs, setlists)
      const file = await driveBackup(token, bytes, backupFileName())
      markDriveBackup()
      setConnected(true)
      setNotice(`Backed up to Google Drive as ${file.name}.`)
    } catch (error) {
      setNotice(driveErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const openRestore = async () => {
    setBusy(true)
    setNotice('')
    try {
      const token = await ensureToken()
      const files = await listDriveBackups(token)
      setBackups(files)
      setShowRestore(true)
      setConnected(true)
      if (!files.length) setNotice('No backups found in Google Drive.')
    } catch (error) {
      setNotice(driveErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const restore = async (file: DriveBackupFile) => {
    setBusy(true)
    setNotice('')
    try {
      const token = await ensureToken()
      const bytes = await downloadDriveBackup(token, file.id)
      const result = await readImportFiles(
        [new File([bytes as BlobPart], file.name, { type: 'application/zip' })],
        songs,
      )
      if (!result.backup) {
        setNotice(result.issues[0]?.message ?? 'That file is not a Chordstand backup.')
        return
      }
      await restoreBackup(result.backup.songs, result.backup.setlists)
      setShowRestore(false)
      setNotice(`Restored ${result.backup.songs.length} songs from ${file.name}.`)
    } catch (error) {
      setNotice(driveErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (file: DriveBackupFile) => {
    setBusy(true)
    setNotice('')
    try {
      const token = await ensureToken()
      await deleteDriveBackup(token, file.id)
      setBackups((current) => current?.filter((item) => item.id !== file.id) ?? null)
      setNotice(`Deleted ${file.name} from Google Drive.`)
    } catch (error) {
      setNotice(driveErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    setNotice('')
    const token = getDriveToken()
    if (token) {
      try {
        await revokeDriveToken(token)
      } catch {
        // The token is dropped locally even if revoking it fails.
      }
    }
    setConnected(false)
    setBackups(null)
    setShowRestore(false)
    setNotice('Disconnected from Google Drive.')
    setBusy(false)
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return (
      <div className="drive-section">
        <div className="drive-head">
          <div className="drive-head-text">
            <strong>Google Drive</strong>
          </div>
          <Icon name="cloud" size={18} />
        </div>
        <p className="muted small">Google Drive is not configured in this build.</p>
      </div>
    )
  }

  return (
    <div className="drive-section">
      <div className="drive-head">
        <div className="drive-head-text">
          <strong>Google Drive</strong>
        </div>
        <Icon name="cloud" size={18} />
      </div>

      <div className={`drive-status ${connected ? 'is-connected' : ''}`}>
        <Icon name={connected ? 'check' : 'cloud'} size={16} />
        <span>{connected ? 'Connected' : 'Not connected'}</span>
      </div>

      <div className="storage-actions">
        {connected ? (
          <button className="primary-button" onClick={() => void backUp()} disabled={busy || !songs.length}>
            <Icon name="upload" size={18} />
            {busy ? 'Backing up…' : 'Back up to Google Drive'}
          </button>
        ) : (
          <button className="primary-button" onClick={() => void connect()} disabled={busy}>
            <Icon name="link" size={18} />
            {busy ? 'Redirecting…' : 'Sign in with Google Drive'}
          </button>
        )}
        {connected ? (
          <>
            <button className="ghost-button" onClick={() => void openRestore()} disabled={busy}>
              <Icon name="refresh" size={18} />
              Restore from Google Drive
            </button>
            <button className="ghost-button" onClick={() => void disconnect()} disabled={busy}>
              <Icon name="close" size={18} />
              Disconnect
            </button>
          </>
        ) : null}
      </div>

      {lastDriveBackupAt ? (
        <p className="fine-print">Last Google Drive backup: {describeBackupAge(lastDriveBackupAt)}</p>
      ) : null}

      {showRestore ? (
        <div className="drive-restore">
          <div className="drive-restore-head">
            <strong>Backups in Google Drive</strong>
            <button
              className="icon-btn"
              onClick={() => setShowRestore(false)}
              aria-label="Close"
              disabled={busy}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          {backups && backups.length ? (
            <ul className="drive-restore-list">
              {backups.map((file) => (
                <li key={file.id}>
                  <div className="drive-restore-info">
                    <strong>{file.name}</strong>
                    <em>
                      {file.modifiedTime
                        ? new Date(file.modifiedTime).toLocaleString()
                        : 'Unknown date'}
                    </em>
                  </div>
                  <div className="drive-restore-actions">
                    <button className="ghost-button" onClick={() => void restore(file)} disabled={busy}>
                      Restore
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => void remove(file)}
                      disabled={busy}
                      aria-label={`Delete ${file.name}`}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No backups yet. Back up to Google Drive first.</p>
          )}
        </div>
      ) : null}

      {notice ? <p className="storage-notice">{notice}</p> : null}
    </div>
  )
}

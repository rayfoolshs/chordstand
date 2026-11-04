import { useEffect, useState } from 'react'
import { buildBackupZip, buildLibraryZip } from '../core/import'
import { saveBackupFile } from '../core/backupShare'
import { backupFileName, describeBackupAge, estimateLibraryBytes, formatBytes } from '../core/storage'
import { useSettings } from '../store/useSettings'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { Modal } from './Modal'

export function StoragePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const songs = useStore((state) => state.songs)
  const setlists = useStore((state) => state.setlists)
  const lastBackupAt = useSettings((state) => state.lastBackupAt)
  const markBackup = useSettings((state) => state.markBackup)

  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const libraryBytes = estimateLibraryBytes(songs, setlists)
  const songsBytes = estimateLibraryBytes(songs, [])
  const setlistsBytes = estimateLibraryBytes([], setlists)

  const refreshStorage = () => {
    void navigator.storage
      ?.estimate?.()
      .then((estimate) => setUsage({ used: estimate.usage ?? 0, quota: estimate.quota ?? 0 }))
      .catch(() => setUsage(null))
    void navigator.storage
      ?.persisted?.()
      .then(setPersisted)
      .catch(() => setPersisted(null))
  }

  useEffect(() => {
    if (!open) return
    setNotice('')
    refreshStorage()
  }, [open])

  const saveBackup = async () => {
    setBusy(true)
    setNotice('')
    try {
      // Let the "Preparing…" state paint before zipping a large library.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const bytes = buildBackupZip(songs, setlists)
      const result = await saveBackupFile(bytes, backupFileName())
      if (result === 'cancelled') {
        setNotice('Backup cancelled.')
      } else {
        markBackup()
        setNotice(
          result === 'shared'
            ? 'Backup shared. Choose Save to Files or iCloud Drive to keep it outside this iPad.'
            : 'Backup downloaded. Move it to Files or iCloud Drive to keep it outside this iPad.',
        )
        refreshStorage()
      }
    } catch {
      setNotice('Could not create the backup. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const exportSongs = async () => {
    setBusy(true)
    setNotice('')
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const bytes = buildLibraryZip(songs)
      const date = new Date()
      const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate(),
      ).padStart(2, '0')}`
      const result = await saveBackupFile(bytes, `chordstand-songs-${stamp}.zip`)
      setNotice(result === 'cancelled' ? 'Export cancelled.' : 'Songs exported as a zip of .onsong files.')
    } catch {
      setNotice('Could not export the songs. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const protect = async () => {
    try {
      const granted = await navigator.storage?.persist?.()
      setPersisted(Boolean(granted))
      setNotice(granted ? 'Storage marked persistent.' : 'The browser did not grant persistent storage.')
    } catch {
      setNotice('Could not request persistent storage.')
    }
  }

  const percent = usage && usage.quota > 0 ? Math.min(100, (usage.used / usage.quota) * 100) : 0
  const backupAge = describeBackupAge(lastBackupAt)
  const backupStale = !lastBackupAt || Date.now() - lastBackupAt > 7 * 24 * 60 * 60 * 1000

  return (
    <Modal open={open} title="Storage & backups" onClose={onClose} wide>
      <div className="stack">
        <p className="muted">
          Songs live in this iPad's private browser storage, not in the Files app. A backup zip is the copy you can
          move to iCloud Drive or another device.
        </p>

        <div className="storage-grid">
          <div className="storage-stat">
            <span>Songs</span>
            <strong>{songs.length}</strong>
            <em>{formatBytes(songsBytes)}</em>
          </div>
          <div className="storage-stat">
            <span>Set lists</span>
            <strong>{setlists.length}</strong>
            <em>{formatBytes(setlistsBytes)}</em>
          </div>
          <div className="storage-stat">
            <span>Library data</span>
            <strong>{formatBytes(libraryBytes)}</strong>
            <em>songs + sets</em>
          </div>
          <div className="storage-stat">
            <span>App storage</span>
            <strong>{usage ? formatBytes(usage.used) : '—'}</strong>
            <em>{usage && usage.quota ? `of ${formatBytes(usage.quota)} available` : 'browser estimate'}</em>
          </div>
        </div>

        {usage && usage.quota > 0 ? (
          <div className="storage-bar" aria-hidden="true">
            <span style={{ width: `${Math.max(percent, percent > 0 ? 1 : 0)}%` }} />
          </div>
        ) : null}

        <div className={`storage-backup-state ${backupStale ? 'is-stale' : ''}`}>
          <Icon name={backupStale ? 'download' : 'check'} size={18} />
          <div>
            <strong>{backupStale ? 'No recent backup' : 'Backup up to date'}</strong>
            <em>Last backup: {backupAge}</em>
          </div>
        </div>

        <div className="storage-actions">
          <button className="primary-button" onClick={() => void saveBackup()} disabled={busy || !songs.length}>
            <Icon name="download" size={18} />
            {busy ? 'Preparing…' : 'Save full backup to Files'}
          </button>
          <button className="ghost-button" onClick={() => void exportSongs()} disabled={busy || !songs.length}>
            <Icon name="download" size={18} />
            Export all songs (.onsong zip)
          </button>
          {persisted === false ? (
            <button className="ghost-button" onClick={() => void protect()}>
              <Icon name="check" size={18} />
              Protect storage from cleanup
            </button>
          ) : null}
        </div>

        {notice ? <p className="storage-notice">{notice}</p> : null}

        <p className="fine-print">
          {persisted === true
            ? 'Storage is marked persistent. Deleting the app or clearing Safari data still removes it.'
            : persisted === false
              ? 'The browser treats this storage as best-effort. Keep an external backup.'
              : 'Storage status unavailable in this browser.'}
        </p>
      </div>
    </Modal>
  )
}

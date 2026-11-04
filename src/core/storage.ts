import type { Setlist, Song } from './types'

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** exponent
  const digits = value >= 100 || exponent === 0 ? 0 : 1
  return `${value.toFixed(digits)} ${units[exponent]}`
}

/** Approximate size of the library after JSON/UTF-8 serialisation. */
export function estimateLibraryBytes(songs: Song[], setlists: Setlist[]): number {
  const encoder = new TextEncoder()
  let total = 0
  songs.forEach((song) => {
    total += encoder.encode(JSON.stringify(song)).length
  })
  setlists.forEach((setlist) => {
    total += encoder.encode(JSON.stringify(setlist)).length
  })
  return total
}

export function backupFileName(date = new Date()): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
  return `chordstand-backup-${stamp}.zip`
}

export function describeBackupAge(timestamp: number | undefined, now = Date.now()): string {
  if (!timestamp) return 'No backup yet'
  const minutes = Math.floor((now - timestamp) / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(timestamp).toLocaleDateString()
}

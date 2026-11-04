import { downloadBytes } from './import'

export type ShareResult = 'shared' | 'downloaded' | 'cancelled'

/**
 * Prefer the native share sheet so the backup can be saved to the Files app
 * on iPad in one step. Fall back to a normal browser download.
 */
export async function saveBackupFile(bytes: Uint8Array, fileName: string): Promise<ShareResult> {
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' })
  const file = new File([blob], fileName, { type: 'application/zip' })

  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Chordstand backup' })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    }
  }

  downloadBytes(fileName, bytes, 'application/zip')
  return 'downloaded'
}

import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import type { ImportCandidate, Setlist, Song, SongFormat } from './types'
import { parseSong, songToOnsong } from './parser'

const TEXT_EXTENSIONS = new Set(['onsong', 'txt', 'text', 'chordpro', 'chopro', 'cho', 'crd', 'pro', 'chord'])

export interface ImportIssue {
  fileName: string
  message: string
}

export interface ImportResult {
  candidates: ImportCandidate[]
  issues: ImportIssue[]
  backup?: BackupBundle
}

export interface BackupBundle {
  songs: Song[]
  setlists: Setlist[]
}

function extensionOf(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? match[1] : ''
}

function formatFor(name: string): SongFormat {
  const extension = extensionOf(name)
  if (extension === 'onsong') return 'onsong'
  if (['chordpro', 'chopro', 'cho', 'crd', 'pro', 'chord'].includes(extension)) return 'chordpro'
  return 'text'
}

function decode(bytes: Uint8Array): string {
  try {
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    if (!utf8.includes('\uFFFD')) return utf8
    // Old OnSong libraries were often exported as Windows-1252.
    return new TextDecoder('windows-1252').decode(bytes)
  } catch {
    return strFromU8(bytes)
  }
}

export function candidateFromText(
  fileName: string,
  text: string,
  existing: Song[] = [],
): ImportCandidate {
  const parsed = parseSong(text, { fileName, format: formatFor(fileName) })
  const duplicate = existing.find(
    (song) =>
      song.title.trim().toLowerCase() === parsed.title.trim().toLowerCase() &&
      song.artist.trim().toLowerCase() === parsed.artist.trim().toLowerCase(),
  )

  return {
    fileName,
    text,
    parsed,
    selected: !duplicate,
    duplicateOf: duplicate?.id,
  }
}

export async function readImportFiles(files: File[], existing: Song[] = []): Promise<ImportResult> {
  const candidates: ImportCandidate[] = []
  const issues: ImportIssue[] = []
  let backup: BackupBundle | undefined

  const readBackup = (name: string, bytes: Uint8Array): boolean => {
    try {
      const data = JSON.parse(decode(bytes)) as { songs?: unknown; setlists?: unknown }
      if (Array.isArray(data.songs) && Array.isArray(data.setlists)) {
        backup = { songs: data.songs as Song[], setlists: data.setlists as Setlist[] }
        return true
      }
      issues.push({ fileName: name, message: 'This JSON file is not a Chordstand backup.' })
    } catch {
      issues.push({ fileName: name, message: 'Could not read this backup file.' })
    }
    return false
  }

  const handleEntry = (name: string, bytes: Uint8Array) => {
    const extension = extensionOf(name)
    if (extension === 'zip') {
      try {
        const entries = unzipSync(bytes)
        const backupEntry = Object.entries(entries).find(([entryName]) =>
          entryName.endsWith('chordstand-backup.json'),
        )
        // A backup already contains every song, so restore it instead of
        // importing its .onsong files a second time.
        if (backupEntry && readBackup(backupEntry[0], backupEntry[1])) return

        Object.entries(entries).forEach(([entryName, entryBytes]) => {
          if (entryName.endsWith('/')) return
          if (entryName.includes('__MACOSX')) return
          const entryExtension = extensionOf(entryName)
          if (TEXT_EXTENSIONS.has(entryExtension)) {
            handleEntry(entryName, entryBytes)
          } else if (entryExtension === 'pdf' || entryExtension === 'rtf' || entryExtension === 'docx') {
            issues.push({
              fileName: entryName,
              message: 'PDF and document charts are not supported yet — text charts only in this build.',
            })
          }
        })
      } catch {
        issues.push({ fileName: name, message: 'Could not open this zip archive.' })
      }
      return
    }

    if (extension === 'json') {
      readBackup(name, bytes)
      return
    }

    if (extension === 'pdf' || extension === 'png' || extension === 'jpg' || extension === 'jpeg') {
      issues.push({
        fileName: name,
        message: 'Image/PDF charts are not supported yet — export as OnSong or ChordPro text.',
      })
      return
    }

    if (!TEXT_EXTENSIONS.has(extension)) {
      issues.push({ fileName: name, message: `Unsupported file type ".${extension || '?'}".` })
      return
    }

    const text = decode(bytes)
    if (!text.trim()) {
      issues.push({ fileName: name, message: 'File is empty.' })
      return
    }
    candidates.push(candidateFromText(name, text, existing))
  }

  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    handleEntry(file.name, bytes)
  }

  return { candidates, issues, backup }
}

export function songFromCandidate(candidate: ImportCandidate, now = Date.now()): Song {
  const { parsed, text } = candidate
  const meta = parsed.meta
  return {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: parsed.title || 'Untitled',
    artist: parsed.artist || '',
    author: meta.author,
    key: meta.key,
    transposedKey: meta.transposedKey,
    capo: meta.capo,
    tempo: meta.tempo,
    time: meta.time,
    duration: meta.duration,
    books: meta.books ?? [],
    number: meta.number,
    tags: meta.tags ?? [],
    copyright: meta.copyright,
    ccli: meta.ccli,
    tuning: meta.tuning,
    pitch: meta.pitch,
    flow: meta.flow,
    source: text,
    format: formatFor(candidate.fileName),
    createdAt: now,
    updatedAt: now,
    custom: meta.custom ?? {},
  }
}

export function safeFileName(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'song'
  )
}

export function buildLibraryZip(songs: Song[]): Uint8Array {
  const files: Record<string, Uint8Array> = {}
  const used = new Set<string>()
  songs.forEach((song) => {
    let base = safeFileName(`${song.title}${song.artist ? ` - ${song.artist}` : ''}`)
    let name = `${base}.onsong`
    let suffix = 2
    while (used.has(name.toLowerCase())) {
      name = `${base} (${suffix}).onsong`
      suffix += 1
    }
    used.add(name.toLowerCase())
    files[`songs/${name}`] = strToU8(songToOnsong(song))
  })
  return zipSync(files, { level: 6 })
}

export interface BackupPayload {
  version: 1
  exportedAt: string
  songs: Song[]
  setlists: unknown[]
}

export function buildBackupZip(songs: Song[], setlists: unknown[]): Uint8Array {
  const payload: BackupPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    songs,
    setlists,
  }
  const files: Record<string, Uint8Array> = {
    'chordstand-backup.json': strToU8(JSON.stringify(payload, null, 2)),
  }
  const library = buildLibraryZip(songs)
  const libraryEntries = unzipSync(library)
  Object.entries(libraryEntries).forEach(([name, bytes]) => {
    files[name] = bytes
  })
  return zipSync(files, { level: 6 })
}

export function downloadBytes(fileName: string, bytes: Uint8Array, type = 'application/octet-stream'): void {
  const blob = new Blob([bytes as BlobPart], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function downloadText(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

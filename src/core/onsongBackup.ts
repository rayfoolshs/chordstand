import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { unzipSync } from 'fflate'
import { parseSong, splitSource } from './parser'
import type { Song } from './types'

export interface BackupSongDraft {
  externalId?: string
  title: string
  artist: string
  source: string
}

export interface BackupSetlistDraft {
  name: string
  songs: Array<{ title: string; artist: string }>
}

export interface OnSongBackupResult {
  songs: BackupSongDraft[]
  setlists: BackupSetlistDraft[]
  notes: string[]
}

interface Column {
  name: string
  type: string
}

type Row = Record<string, SqlValue>

const TITLE_NAMES = /^(title|songtitle|song_title|name|displayname|display_name)$/i
const ARTIST_NAMES = /^(artist|author|byline|subtitle|composer|songartist|song_artist)$/i

let sqlPromise: Promise<SqlJsStatic> | null = null

function loadSql(): Promise<SqlJsStatic> {
  sqlPromise ??= initSqlJs({ locateFile: () => wasmUrl })
  return sqlPromise
}

/** Read an OnSong `.backup` archive (a zip containing OnSong.sqlite3). */
export async function readOnSongBackup(bytes: Uint8Array): Promise<OnSongBackupResult | null> {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch {
    return null
  }

  const dbEntry = Object.entries(entries).find(
    ([name, data]) => /\.(sqlite3?|db)$/i.test(name) && isSqliteFile(data),
  )
  if (!dbEntry) return null

  const SQL = await loadSql()
  const db = new SQL.Database(dbEntry[1])
  try {
    const songs = extractSongsFromDatabase(db)
    const setlists = extractSetlistsFromDatabase(db, songs)
    const notes = [
      `OnSong backup read from ${dbEntry[0]}: ${songs.length} ${songs.length === 1 ? 'song' : 'songs'}${
        setlists.length ? `, ${setlists.length} set ${setlists.length === 1 ? 'list' : 'lists'}` : ''
      }.`,
    ]
    if (!songs.length) {
      const tables = tableNames(db)
      notes.push(`No chart text was found. Tables in this backup: ${tables.join(', ') || 'none'}.`)
    }
    notes.push('PDFs, images and audio in the backup are not imported — text charts only for now.')
    return { songs, setlists, notes }
  } finally {
    db.close()
  }
}

function isSqliteFile(bytes: Uint8Array): boolean {
  const header = 'SQLite format 3\u0000'
  if (bytes.length < header.length) return false
  for (let index = 0; index < header.length; index += 1) {
    if (bytes[index] !== header.charCodeAt(index)) return false
  }
  return true
}

export function extractSongsFromDatabase(db: Database): BackupSongDraft[] {
  const tables = tableNames(db)
  const scored = tables
    .map((table) => {
      const columns = columnInfo(db, table)
      return { table, columns, score: scoreTable(table, columns) }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  const songs: BackupSongDraft[] = []
  const seen = new Set<string>()

  for (const { table, columns } of scored) {
    for (const draft of songsFromTable(db, table, columns)) {
      const key = `${normalise(draft.title)}|${normalise(draft.artist)}|${draft.source.length}|${hash(draft.source)}`
      if (seen.has(key)) continue
      seen.add(key)
      songs.push(draft)
    }
  }

  return songs
}

export function extractSetlistsFromDatabase(db: Database, songs: BackupSongDraft[]): BackupSetlistDraft[] {
  const byId = new Map<string, BackupSongDraft>()
  const byTitle = new Map<string, BackupSongDraft>()
  songs.forEach((song) => {
    if (song.externalId) byId.set(String(song.externalId), song)
    byTitle.set(normalise(song.title), song)
  })

  const tables = tableNames(db)
  const setTables = tables.filter((table) => {
    if (!/(set|setlist|playlist|service|list)/i.test(table)) return false
    if (/^(songs?|charts?)$/i.test(table)) return false
    // Association tables (set_songs) are handled through their parent set.
    if (/(set|list).*(song|chart)|(song|chart).*(set|list)/i.test(table)) return false
    return true
  })

  const results: BackupSetlistDraft[] = []

  for (const table of setTables) {
    const columns = columnInfo(db, table)
    const rows = readRows(db, table, columns)
    if (!rows.length) continue

    const idColumn = findColumn(columns, /^(id|setid|set_id|uuid)$/i)
    const nameColumn = findColumn(columns, /^(name|title|setname|set_name|displayname)$/i)
    const itemColumn = findColumn(
      columns,
      /^(songs|items|song_ids|songids|songids|entries|contents|tracks|songlist|song_list)$/i,
    )

    const assoc = findAssociation(db, tables, table, idColumn?.name)

    rows.forEach((row) => {
      const setName = nameColumn ? asText(row[nameColumn.name]) : ''
      const setId = idColumn ? String(row[idColumn.name] ?? '') : ''

      let resolved: BackupSongDraft[] = []

      if (itemColumn) {
        resolved = resolveItemList(row[itemColumn.name], byId, byTitle)
      }

      if (!resolved.length && assoc) {
        resolved = resolveAssociation(db, assoc, setId, byId)
      }

      if (!resolved.length) return

      results.push({
        name: setName || `Set ${setId || results.length + 1}`,
        songs: resolved.map((song) => ({ title: song.title, artist: song.artist })),
      })
    })
  }

  // Fallback: songs carry a set_id/list_id column directly.
  if (!results.length) {
    const songTables = tables.map((table) => ({ table, columns: columnInfo(db, table) }))
    for (const { table, columns } of songTables) {
      const setRef = findColumn(columns, /^(set|setlist|playlist|list|service)_?id$/i)
      if (!setRef) continue
      const rows = readRows(db, table, columns)
      const titleColumn = findColumn(columns, /(title|name)/i)
      const grouped = new Map<string, BackupSetlistDraft>()
      rows.forEach((row) => {
        const setId = String(row[setRef.name] ?? '')
        if (!setId) return
        const title = titleColumn ? asText(row[titleColumn.name]) : ''
        const song = byTitle.get(normalise(title))
        if (!song) return
        const existing = grouped.get(setId) ?? { name: `Set ${setId}`, songs: [] }
        existing.songs.push({ title: song.title, artist: song.artist })
        grouped.set(setId, existing)
      })
      results.push(...grouped.values())
      if (results.length) break
    }
  }

  return dedupeSetlists(results)
}

interface Association {
  table: string
  setColumn: string
  songColumn: string
  orderColumn?: string
}

function findAssociation(
  db: Database,
  tables: string[],
  setTable: string,
  setIdColumn: string | undefined,
): Association | null {
  if (!setIdColumn) return null
  const candidates = tables.filter((table) => {
    if (table === setTable) return false
    if (!/set|list|playlist|service/i.test(table)) return false
    if (!/song|chart|item|track/i.test(table)) return false
    return true
  })

  for (const table of candidates) {
    const columns = columnInfo(db, table)
    const setColumn = findColumn(columns, /(set|setlist|playlist|list|service)_?id$/i)
    const songColumn = findColumn(columns, /(song|chart|track|item)_?id$/i)
    if (!setColumn || !songColumn) continue
    return {
      table,
      setColumn: setColumn.name,
      songColumn: songColumn.name,
      orderColumn: findColumn(columns, /(position|order|index|sort|sequence)/i)?.name,
    }
  }
  return null
}

function resolveAssociation(
  db: Database,
  assoc: Association,
  setId: string,
  byId: Map<string, BackupSongDraft>,
): BackupSongDraft[] {
  if (!setId) return []
  const columns = columnInfo(db, assoc.table)
  const rows = readRows(db, assoc.table, columns)
  const filtered = rows.filter((row) => String(row[assoc.setColumn] ?? '') === setId)
  if (assoc.orderColumn) {
    filtered.sort((a, b) => Number(a[assoc.orderColumn!] ?? 0) - Number(b[assoc.orderColumn!] ?? 0))
  }
  return filtered
    .map((row) => byId.get(String(row[assoc.songColumn] ?? '')))
    .filter((song): song is BackupSongDraft => Boolean(song))
}

function resolveItemList(
  value: SqlValue | undefined,
  byId: Map<string, BackupSongDraft>,
  byTitle: Map<string, BackupSongDraft>,
): BackupSongDraft[] {
  const text = asText(value).trim()
  if (!text) return []

  const resolved: BackupSongDraft[] = []

  const pushReference = (reference: unknown) => {
    if (reference === null || reference === undefined) return
    if (typeof reference === 'object') {
      const record = reference as Record<string, unknown>
      const id =
        record.songId ?? record.song_id ?? record.chartId ?? record.chart_id ?? record.id ?? record.uuid
      const title = record.title ?? record.name
      if (id !== undefined) {
        const song = byId.get(String(id))
        if (song) resolved.push(song)
      } else if (typeof title === 'string') {
        const song = byTitle.get(normalise(title))
        if (song) resolved.push(song)
      }
      return
    }
    const value = String(reference)
    const song = byId.get(value) ?? byTitle.get(normalise(value))
    if (song) resolved.push(song)
  }

  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as unknown
      if (Array.isArray(parsed)) parsed.forEach(pushReference)
      else if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>
        const list = record.songs ?? record.items ?? record.entries
        if (Array.isArray(list)) list.forEach(pushReference)
      }
    } catch {
      // Fall through to comma-separated ids.
    }
  } else {
    text.split(/[,;|\s]+/)
      .filter(Boolean)
      .forEach(pushReference)
  }

  return resolved
}

function songsFromTable(db: Database, table: string, columns: Column[]): BackupSongDraft[] {
  const titleColumn = findColumn(columns, TITLE_NAMES) ?? findColumn(columns, /title/i)
  const artistColumn = findColumn(columns, ARTIST_NAMES) ?? findColumn(columns, /artist|author/i)
  const textColumns = columns.filter((column) => textColumnScore(column.name) > 0)
  if (!textColumns.length) return []

  const rows = readRows(db, table, columns)
  const drafts: BackupSongDraft[] = []

  rows.forEach((row, index) => {
    const textCandidate = textColumns
      .map((column) => ({ name: column.name, value: asText(row[column.name]) }))
      .filter((entry) => entry.value.trim().length > 0)
      .sort((a, b) => chartScore(b.value) - chartScore(a.value))[0]

    if (!textCandidate) return

    const rawChart = cleanChart(textCandidate.value)
    if (!rawChart.trim()) return
    if (/^\{\\rtf/i.test(rawChart)) return

    const hasMetadata = /(^|\n)\s*(title|artist|key|capo|tempo)\s*:/i.test(rawChart)
    const parsed = hasMetadata ? parseSong(rawChart, { fileName: `${table}.onsong` }) : null
    const body = hasMetadata ? splitSource(rawChart).body.join('\n').trim() || rawChart.trim() : rawChart.trim()

    const meta = parsed?.meta ?? {}
    const title = asText(titleColumn ? row[titleColumn.name] : '') || meta.title || `Song ${index + 1}`
    const artist = asText(artistColumn ? row[artistColumn.name] : '') || meta.artist || ''

    const merged = {
      title,
      artist,
      key: pickMeta(columns, row, /^(key|songkey|song_key|musickey)$/i) || meta.key,
      capo: numberOrUndefined(pickMeta(columns, row, /^capo$/i)) ?? meta.capo,
      tempo: numberOrUndefined(pickMeta(columns, row, /^(tempo|bpm)$/i)) ?? meta.tempo,
      time: pickMeta(columns, row, /^(time|timesignature|time_signature)$/i) || meta.time,
      duration: numberOrUndefined(pickMeta(columns, row, /^(duration|length)$/i)) ?? meta.duration,
      books: listOrUndefined(pickMeta(columns, row, /^(book|books)$/i)) ?? meta.books,
      tags:
        listOrUndefined(pickMeta(columns, row, /^(keywords|tags|topics|topic)$/i)) ?? meta.tags,
      flow: listOrUndefined(pickMeta(columns, row, /^flow$/i)) ?? meta.flow,
      number: pickMeta(columns, row, /^number$/i) || meta.number,
      copyright: pickMeta(columns, row, /^(copyright|footer)$/i) || meta.copyright,
      ccli: pickMeta(columns, row, /^ccli$/i) || meta.ccli,
      tuning: pickMeta(columns, row, /^tuning$/i) || meta.tuning,
      pitch: pickMeta(columns, row, /^pitch$/i) || meta.pitch,
    }

    drafts.push({
      externalId: externalIdOf(columns, row),
      title: merged.title,
      artist: merged.artist,
      source: buildSource(merged, body),
    })
  })

  return drafts
}

function buildSource(meta: Partial<Song>, body: string): string {
  const header: string[] = [`Title: ${meta.title ?? ''}`]
  if (meta.artist) header.push(`Artist: ${meta.artist}`)
  if (meta.key) header.push(`Key: ${meta.key}`)
  if (meta.capo) header.push(`Capo: ${meta.capo}`)
  if (meta.tempo) header.push(`Tempo: ${meta.tempo}`)
  if (meta.time) header.push(`Time: ${meta.time}`)
  if (meta.duration) header.push(`Duration: ${Math.round(meta.duration)}`)
  if (meta.books?.length) header.push(`Book: ${meta.books.join(', ')}`)
  if (meta.number) header.push(`Number: ${meta.number}`)
  if (meta.flow?.length) header.push(`Flow: ${meta.flow.join(', ')}`)
  if (meta.tags?.length) header.push(`Keywords: ${meta.tags.join(', ')}`)
  if (meta.copyright) header.push(`Copyright: ${meta.copyright}`)
  if (meta.ccli) header.push(`CCLI: ${meta.ccli}`)
  if (meta.tuning) header.push(`Tuning: ${meta.tuning}`)
  if (meta.pitch) header.push(`Pitch: ${meta.pitch}`)
  return `${header.join('\n')}\n\n${body}\n`
}

function pickMeta(columns: Column[], row: Row, pattern: RegExp): string {
  const column = findColumn(columns, pattern)
  return column ? asText(row[column.name]) : ''
}

function externalIdOf(columns: Column[], row: Row): string | undefined {
  const column = findColumn(columns, /^(id|uuid|identifier|rowid|songid|song_id)$/i)
  if (!column) return undefined
  const value = row[column.name]
  return value === null || value === undefined ? undefined : String(value)
}

function scoreTable(table: string, columns: Column[]): number {
  if (/media|file|attachment|preference|setting|style|annotation|log|history|asset|image/i.test(table)) {
    return -1
  }

  let score = 0
  if (columns.some((column) => TITLE_NAMES.test(column.name))) score += 5
  if (columns.some((column) => ARTIST_NAMES.test(column.name))) score += 3
  if (columns.some((column) => textColumnScore(column.name) > 0)) score += 6
  if (/song|chart|library/i.test(table)) score += 3
  return score
}

function textColumnScore(name: string): number {
  const normalised = name.toLowerCase()
  if (/^(lyrics?|text|body|content|chart|source|onsong|rawtext|markdown|value)$/.test(normalised)) return 10
  if (/(lyrics?|songtext|textcontent|chart|onsong|body|content)/.test(normalised)) return 7
  return 0
}

function chartScore(text: string): number {
  let score = text.length
  if (text.includes('[')) score += 40
  if (text.includes('\n')) score += 20
  if (/(^|\n)\s*title\s*:/i.test(text)) score += 30
  if (/<br\s*\/?>|<\/p>/i.test(text)) score /= 2
  return score
}

function cleanChart(text: string): string {
  let value = text.replace(/\u0000/g, '').replace(/^\uFEFF/, '')
  if (/<br\s*\/?>|<\/?p\b|<\/?div\b/i.test(value)) {
    value = value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
  }
  if (!value.includes('\n') && value.includes('\\n')) {
    value = value.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
  }
  return value.replace(/\r\n?/g, '\n')
}

function numberOrUndefined(value: string): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : undefined
}

function listOrUndefined(value: string): string[] | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {
    // Comma/semicolon separated.
  }
  const list = value
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean)
  return list.length ? list : undefined
}

function tableNames(db: Database): string[] {
  const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  if (!result.length) return []
  return result[0].values.map((row) => String(row[0])).filter(Boolean)
}

function columnInfo(db: Database, table: string): Column[] {
  const result = db.exec(`PRAGMA table_info(${quoteIdentifier(table)})`)
  if (!result.length) return []
  const nameIndex = result[0].columns.indexOf('name')
  const typeIndex = result[0].columns.indexOf('type')
  return result[0].values.map((row) => ({
    name: String(row[nameIndex] ?? ''),
    type: String(row[typeIndex] ?? ''),
  }))
}

function readRows(db: Database, table: string, _columns: Column[]): Row[] {
  const result = db.exec(`SELECT * FROM ${quoteIdentifier(table)}`)
  if (!result.length) return []
  const names = result[0].columns
  return result[0].values.map((values) => {
    const row: Row = {}
    names.forEach((name, index) => {
      row[name] = values[index]
    })
    return row
  })
}

function findColumn(columns: Column[], pattern: RegExp): Column | undefined {
  return columns.find((column) => pattern.test(column.name))
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function asText(value: SqlValue | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value instanceof Uint8Array) {
    try {
      return new TextDecoder('utf-8').decode(value)
    } catch {
      return ''
    }
  }
  return ''
}

function normalise(value: string): string {
  return value.trim().toLowerCase()
}

function hash(value: string): number {
  let result = 5381
  for (let index = 0; index < value.length; index += 1) {
    result = ((result << 5) + result + value.charCodeAt(index)) | 0
  }
  return result
}

function dedupeSetlists(setlists: BackupSetlistDraft[]): BackupSetlistDraft[] {
  const seen = new Map<string, BackupSetlistDraft>()
  setlists.forEach((setlist) => {
    const key = `${normalise(setlist.name)}|${setlist.songs.map((song) => normalise(song.title)).join('|')}`
    if (!seen.has(key) && setlist.songs.length) seen.set(key, setlist)
  })
  return [...seen.values()]
}

import type { ChartLine, ChordSegment, ParseResult, Song } from './types'
import { isBarToken, isChordToken, parseChord } from './chords'

const CANONICAL_KEYS: Record<string, string> = {
  title: 'title',
  t: 'title',
  song: 'title',
  artist: 'artist',
  subtitle: 'artist',
  st: 'artist',
  su: 'artist',
  by: 'artist',
  author: 'author',
  key: 'key',
  transposedkey: 'transposedKey',
  transposekey: 'transposedKey',
  in: 'transposedKey',
  capo: 'capo',
  tempo: 'tempo',
  bpm: 'tempo',
  time: 'time',
  timesignature: 'time',
  duration: 'duration',
  length: 'duration',
  book: 'books',
  books: 'books',
  number: 'number',
  flow: 'flow',
  keywords: 'tags',
  topic: 'tags',
  topics: 'tags',
  tags: 'tags',
  copyright: 'copyright',
  footer: 'copyright',
  f: 'copyright',
  ccli: 'ccli',
  tuning: 'tuning',
  pitch: 'pitch',
}

const SECTION_RE =
  /^(intro|verse|pre[\s-]?chorus|chorus|post[\s-]?chorus|bridge|refrain|tag|outro|instrumental|solo|interlude|vamp|ending|turnaround|breakdown|hook|riff|groove)\b[\s\d:.#-]*$/i

const DIRECTIVE_RE = /^\{\s*([a-zA-Z0-9_-]+)\s*(?::\s*([^}]*))?\}$/

interface HeaderResult {
  title?: string
  artist?: string
  meta: Partial<Song>
  bodyStart: number
  warnings: string[]
  custom: Record<string, string>
}

function normaliseTag(raw: string): string {
  return raw.toLowerCase().replace(/[\s_-]/g, '')
}

function parseSeconds(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const clock = trimmed.match(/^(\d+):([0-5]\d)$/)
  if (clock) return Number(clock[1]) * 60 + Number(clock[2])
  const numeric = Number(trimmed)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined
}

function listValue(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function assignMeta(
  meta: Partial<Song>,
  custom: Record<string, string>,
  rawName: string,
  value: string,
  warnings: string[],
): void {
  const name = normaliseTag(rawName)
  const canonical = CANONICAL_KEYS[name]
  const trimmed = value.trim()

  if (!canonical) {
    custom[rawName.trim()] = trimmed
    return
  }

  switch (canonical) {
    case 'title':
      meta.title = trimmed
      break
    case 'artist':
      meta.artist = trimmed
      break
    case 'author':
      meta.author = trimmed
      break
    case 'key':
      meta.key = trimmed
      break
    case 'transposedKey':
      meta.transposedKey = trimmed
      break
    case 'capo': {
      const capo = Number.parseInt(trimmed, 10)
      if (Number.isFinite(capo)) meta.capo = capo
      else warnings.push(`Could not read capo value "${trimmed}"`)
      break
    }
    case 'tempo': {
      const tempo = Number.parseInt(trimmed, 10)
      if (Number.isFinite(tempo)) meta.tempo = tempo
      else warnings.push(`Could not read tempo value "${trimmed}"`)
      break
    }
    case 'time':
      meta.time = trimmed
      break
    case 'duration': {
      const seconds = parseSeconds(trimmed)
      if (seconds) meta.duration = seconds
      else warnings.push(`Could not read duration value "${trimmed}"`)
      break
    }
    case 'books':
      meta.books = listValue(trimmed)
      break
    case 'number':
      meta.number = trimmed
      break
    case 'flow':
      meta.flow = listValue(trimmed)
      break
    case 'tags':
      meta.tags = listValue(trimmed)
      break
    case 'copyright':
      meta.copyright = trimmed
      break
    case 'ccli':
      meta.ccli = trimmed
      break
    case 'tuning':
      meta.tuning = trimmed
      break
    case 'pitch':
      meta.pitch = trimmed
      break
  }
}

function parseHeader(lines: string[], fallbackTitle: string): HeaderResult {
  const meta: Partial<Song> = {}
  const custom: Record<string, string> = {}
  const warnings: string[] = []

  // ChordPro metadata lives at the top of the file. Stop at the first blank
  // line or the first body directive so mid-song {key:} changes cannot
  // overwrite the song's real key.
  for (const line of lines) {
    const trimmedLine = line.trim()
    const directive = trimmedLine.match(DIRECTIVE_RE)
    if (!directive) {
      if (!trimmedLine) break
      continue
    }
    const name = normaliseTag(directive[1])
    if (!CANONICAL_KEYS[name]) break
    assignMeta(meta, custom, directive[1], directive[2] ?? '', warnings)
  }

  // OnSong metadata lives in the first section: name/value pairs before the
  // first blank line.
  let boundary = lines.findIndex((line) => line.trim() === '')
  if (boundary === -1) boundary = lines.length
  const header = lines.slice(0, boundary)

  const seenKnownTag = header.some((line) => {
    const match = line.match(/^([A-Za-z][A-Za-z0-9 _-]{0,24}):\s*(.*)$/)
    return Boolean(match && CANONICAL_KEYS[normaliseTag(match[1])])
  })

  const plain: string[] = []
  let lastMetaIndex = -1

  header.forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return
    if (trimmed.startsWith('{')) return
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) return
    if (parseBracketedLine(trimmed, 0)) return
    if (isChordLine(trimmed) || isSectionLabel(trimmed)) return

    const pair = trimmed.match(/^([A-Za-z][A-Za-z0-9 _-]{0,32}):\s*(.*)$/)
    if (pair && (CANONICAL_KEYS[normaliseTag(pair[1])] || index <= lastMetaIndex + 1)) {
      assignMeta(meta, custom, pair[1], pair[2], warnings)
      lastMetaIndex = index
      return
    }
    if (pair && seenKnownTag) {
      assignMeta(meta, custom, pair[1], pair[2], warnings)
      lastMetaIndex = index
      return
    }
    plain.push(trimmed)
  })

  // "Title / Artist" shorthand only when the block clearly ends in metadata.
  if (seenKnownTag) {
    if (!meta.title && plain[0]) meta.title = plain[0]
    if (!meta.artist && plain[1]) meta.artist = plain[1]
  } else if (plain.length) {
    // OnSong treats the first two plain lines as title and artist even when
    // there are no other metadata tags.
    if (!meta.title) meta.title = plain[0]
    if (!meta.artist && plain[1]) meta.artist = plain[1]
  } else if (!meta.title) {
    // Without metadata, the filename is a far safer title than a lyric line.
    meta.title = fallbackTitle
  }

  if (!meta.title) meta.title = fallbackTitle

  // `TransposedKey` means "play it in this key"; keep the written key too.
  if (meta.transposedKey && !meta.key) {
    meta.key = meta.transposedKey
    delete meta.transposedKey
  }

  let bodyStart = Math.min(boundary + 1, lines.length)
  // ChordPro files often have no blank line between metadata and chart, so
  // fall back to "first line that is clearly chart content".
  if (boundary === lines.length) {
    const firstBody = lines.findIndex((line) => {
      const trimmed = line.trim()
      if (!trimmed) return false
      const directive = trimmed.match(DIRECTIVE_RE)
      if (directive) return !CANONICAL_KEYS[normaliseTag(directive[1])]
      return trimmed.startsWith('[') || isChordLine(trimmed) || isSectionLabel(trimmed)
    })
    bodyStart = firstBody === -1 ? lines.length : firstBody
  }

  return {
    title: meta.title ?? fallbackTitle,
    artist: meta.artist ?? '',
    meta,
    bodyStart,
    warnings,
    custom,
  }
}

function isDirective(line: string): boolean {
  return DIRECTIVE_RE.test(line.trim())
}

function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean)
  if (!tokens.length) return false
  if (!tokens.some((token) => parseChord(token) !== null && !isBarToken(token))) return false
  return tokens.every((token) => isChordToken(token))
}

function isSectionLabel(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length > 48) return false
  if (isChordLine(trimmed)) return false
  return SECTION_RE.test(trimmed)
}

function cleanSectionLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ')
}

function parseBracketedLine(
  line: string,
  offset: number,
): { kind: 'lyric' | 'chords'; segments: ChordSegment[]; offset: number } | null {
  const segments: ChordSegment[] = []
  const regex = /\[([^\]]*)\]/g
  let cursor = 0
  let match: RegExpExecArray | null
  let sawChord = false

  while ((match = regex.exec(line)) !== null) {
    const before = line.slice(cursor, match.index)
    const content = match[1].trim()
    if (before) {
      if (segments.length) segments[segments.length - 1].text += before
      else segments.push({ text: before })
    }
    const chordLike = parseChord(content) !== null || isBarToken(content)
    if (chordLike) sawChord = true
    segments.push({ chord: chordLike ? content : undefined, text: chordLike ? '' : `[${content}]` })
    cursor = match.index + match[0].length
  }

  const trailing = line.slice(cursor)
  if (trailing) {
    if (segments.length) segments[segments.length - 1].text += trailing
    else segments.push({ text: trailing })
  }

  if (!sawChord) return null
  const hasLyricText = segments.some((segment) => segment.text.trim().length > 0)
  return {
    kind: hasLyricText ? 'lyric' : 'chords',
    segments: segments.filter((segment) => segment.chord || segment.text),
    offset,
  }
}

function mergeChordsOverLyrics(chordLine: string, lyricLine: string): ChordSegment[] {
  const matches = [...chordLine.matchAll(/\S+/g)]
  const segments: ChordSegment[] = []
  const lyric = lyricLine.replace(/\s+$/, '')
  let previousEnd = 0

  const chords = matches
    .map((match) => ({ chord: match[0], position: match.index ?? 0 }))
    .filter((entry) => parseChord(entry.chord) !== null || isBarToken(entry.chord))

  chords.forEach((entry, index) => {
    const start = Math.max(entry.position, previousEnd)
    const next = chords[index + 1]
    const end = next ? Math.min(next.position, lyric.length) : lyric.length
    const text = lyric.slice(start, Math.max(start, end))
    if (start > previousEnd) {
      const gap = lyric.slice(previousEnd, start)
      if (gap) {
        if (segments.length) segments[segments.length - 1].text += gap
        else segments.push({ text: gap })
      }
    }
    if (!segments.length && start > 0) segments.push({ text: lyric.slice(0, start) })
    segments.push({ chord: entry.chord, text })
    previousEnd = Math.max(start, end)
  })

  if (previousEnd < lyric.length) {
    if (segments.length) segments[segments.length - 1].text += lyric.slice(previousEnd)
    else segments.push({ text: lyric.slice(previousEnd) })
  }

  return segments.filter((segment) => segment.chord || segment.text)
}

function parseBody(lines: string[], start: number, warnings: string[]): ChartLine[] {
  const out: ChartLine[] = []
  let offset = 0

  for (let index = start; index < lines.length; index += 1) {
    const raw = lines[index]
    const trimmed = raw.trim()

    if (!trimmed) {
      if (out.length && out[out.length - 1].kind !== 'blank') out.push({ kind: 'blank' })
      continue
    }

    const directive = trimmed.match(DIRECTIVE_RE)
    if (directive) {
      const name = normaliseTag(directive[1])
      const value = (directive[2] ?? '').trim()
      const sectionName = (label: string): ChartLine => ({
        kind: 'section',
        label: cleanSectionLabel(label),
      })

      if (name === 'c' || name === 'comment' || name === 'ci') {
        out.push({ kind: 'comment', text: value })
        continue
      }
      if (name === 'soc' || name === 'startofchorus') {
        out.push(sectionName(value || 'Chorus'))
        continue
      }
      if (name === 'sov' || name === 'startofverse') {
        out.push(sectionName(value || 'Verse'))
        continue
      }
      if (name === 'sob' || name === 'startofbridge') {
        out.push(sectionName(value || 'Bridge'))
        continue
      }
      if (name === 'sot' || name === 'startoftab') {
        out.push(sectionName(value || 'Tab'))
        continue
      }
      if (name === 'sog' || name === 'startofgrid') {
        out.push(sectionName(value || 'Grid'))
        continue
      }
      if (name.startsWith('endof') || /^eo[a-z]+$/.test(name)) {
        continue
      }
      if (name === 'transpose' || name === 'transposekey') {
        const amount = Number.parseInt(value.replace('+', ''), 10)
        if (Number.isFinite(amount)) offset += amount
        else warnings.push(`Could not read inline transpose value "${value}"`)
        continue
      }
      if (name === 'key' || name === 'capo') {
        warnings.push(
          `Mid-song {${name}: ${value}} is preserved in the source but not applied to the chart yet.`,
        )
        continue
      }
      if (name === 'define' || name === 'chord' || name === 'textfont' || name === 'textsize') {
        continue
      }
      continue
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const inner = trimmed.slice(1, -1).trim()
      if (inner && !isChordToken(inner)) {
        out.push({ kind: 'section', label: cleanSectionLabel(inner) })
        continue
      }
    }

    if (isSectionLabel(trimmed)) {
      out.push({ kind: 'section', label: cleanSectionLabel(trimmed) })
      continue
    }

    const next = index + 1 < lines.length ? lines[index + 1] : undefined
    const chordLine = isChordLine(trimmed) && !trimmed.includes('|')

    if (chordLine && next !== undefined) {
      const nextTrimmed = next.trim()
      const nextIsLyric =
        nextTrimmed.length > 0 && !isDirective(nextTrimmed) && !isChordLine(nextTrimmed) && !isSectionLabel(nextTrimmed)

      if (nextIsLyric) {
        out.push({ kind: 'lyric', segments: mergeChordsOverLyrics(trimmed, next), offset })
        index += 1
        continue
      }

      out.push({
        kind: 'chords',
        segments: trimmed
          .split(/\s+/)
          .filter(Boolean)
          .map((chord) => ({ chord, text: '' })),
        offset,
      })
      continue
    }

    if (chordLine) {
      out.push({
        kind: 'chords',
        segments: trimmed
          .split(/\s+/)
          .filter(Boolean)
          .map((chord) => ({ chord, text: '' })),
        offset,
      })
      continue
    }

    const bracketed = parseBracketedLine(raw, offset)
    if (bracketed) {
      out.push({ kind: bracketed.kind, segments: bracketed.segments, offset: bracketed.offset })
      continue
    }

    out.push({ kind: 'lyric', segments: [{ text: raw.replace(/\s+$/, '') }], offset })
  }

  while (out.length && out[out.length - 1].kind === 'blank') out.pop()
  return out
}

export interface ParseOptions {
  fileName?: string
  format?: Song['format']
}

export function parseSong(text: string, options: ParseOptions = {}): ParseResult {
  const source = text.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '')
  const lines = source.split('\n')
  const fallbackTitle = (options.fileName ?? 'Untitled')
    .split('/')
    .pop()!
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()

  const header = parseHeader(lines, fallbackTitle)
  const warnings = [...header.warnings]
  const body = parseBody(lines, header.bodyStart, warnings)

  if (!header.meta.key) {
    const detected = detectKey(body)
    if (detected) header.meta.key = detected
  }

  return {
    title: header.meta.title ?? fallbackTitle,
    artist: header.artist ?? '',
    meta: { ...header.meta, custom: header.custom },
    lines: body,
    warnings,
  }
}

/** Best-effort key detection from the first chord in the chart. */
function detectKey(lines: ChartLine[]): string | undefined {
  for (const line of lines) {
    if (line.kind !== 'lyric' && line.kind !== 'chords') continue
    for (const segment of line.segments) {
      if (!segment.chord || isBarToken(segment.chord)) continue
      const parsed = parseChord(segment.chord)
      if (parsed) return parsed.quality.startsWith('m') && !parsed.quality.startsWith('maj') ? `${parsed.root}m` : parsed.root
    }
  }
  return undefined
}

/** Split a source file into its metadata header and chart body. */
export function splitSource(source: string): { header: string[]; body: string[] } {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blank = lines.findIndex((line) => line.trim() === '')
  if (blank !== -1) {
    return { header: lines.slice(0, blank), body: lines.slice(blank + 1) }
  }

  // ChordPro files can omit the blank line between metadata and chart.
  const firstBody = lines.findIndex((line) => {
    const trimmed = line.trim()
    if (!trimmed) return false
    const directive = trimmed.match(DIRECTIVE_RE)
    if (directive) return !CANONICAL_KEYS[normaliseTag(directive[1])]
    return trimmed.startsWith('[') || isChordLine(trimmed) || isSectionLabel(trimmed)
  })

  if (firstBody === -1) return { header: lines, body: [] }
  return { header: lines.slice(0, firstBody), body: lines.slice(firstBody) }
}

export function songToOnsong(song: Song): string {
  const header: string[] = []
  header.push(`Title: ${song.title}`)
  if (song.artist) header.push(`Artist: ${song.artist}`)
  if (song.author) header.push(`Author: ${song.author}`)
  if (song.key) header.push(`Key: ${song.key}`)
  if (song.capo) header.push(`Capo: ${song.capo}`)
  if (song.tempo) header.push(`Tempo: ${song.tempo}`)
  if (song.time) header.push(`Time: ${song.time}`)
  if (song.duration) header.push(`Duration: ${Math.round(song.duration)}`)
  if (song.books.length) header.push(`Book: ${song.books.join(', ')}`)
  if (song.number) header.push(`Number: ${song.number}`)
  if (song.flow?.length) header.push(`Flow: ${song.flow.join(', ')}`)
  if (song.tags.length) header.push(`Keywords: ${song.tags.join(', ')}`)
  if (song.copyright) header.push(`Copyright: ${song.copyright}`)
  if (song.ccli) header.push(`CCLI: ${song.ccli}`)
  if (song.tuning) header.push(`Tuning: ${song.tuning}`)
  if (song.pitch) header.push(`Pitch: ${song.pitch}`)
  Object.entries(song.custom).forEach(([key, value]) => header.push(`${key}: ${value}`))

  const { body } = splitSource(song.source)
  return `${header.join('\n')}\n\n${body.join('\n').trim()}\n`
}

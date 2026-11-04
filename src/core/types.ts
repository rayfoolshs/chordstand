export interface Song {
  id: string
  title: string
  artist: string
  author?: string
  /** Key the chart is written in, e.g. "G" or "Em". */
  key?: string
  /** Key the chart should be played in, when exported from OnSong with a transposed key. */
  transposedKey?: string
  capo?: number
  tempo?: number
  time?: string
  /** Length in seconds, used to derive autoscroll speed. */
  duration?: number
  books: string[]
  number?: string
  tags: string[]
  copyright?: string
  ccli?: string
  tuning?: string
  pitch?: string
  flow?: string[]
  /** Raw chart text, preserved verbatim so export is lossless. */
  source: string
  format: SongFormat
  createdAt: number
  updatedAt: number
  lastOpenedAt?: number
  /** Extra metadata we did not recognise, kept for round-trip. */
  custom: Record<string, string>
}

export type SongFormat = 'onsong' | 'chordpro' | 'text'

export interface ChordSegment {
  chord?: string
  text: string
}

export type ChartLine =
  | { kind: 'section'; label: string }
  | { kind: 'lyric'; segments: ChordSegment[]; offset: number }
  | { kind: 'chords'; segments: ChordSegment[]; offset: number }
  | { kind: 'comment'; text: string }
  | { kind: 'blank' }
  | { kind: 'pagebreak' }

export interface ParseResult {
  title: string
  artist: string
  meta: Partial<Song>
  lines: ChartLine[]
  warnings: string[]
}

export interface SetlistEntry {
  id: string
  songId: string
  /** Key override for this performance, e.g. "A". */
  key?: string
  capo?: number
  notes?: string
}

export interface Setlist {
  id: string
  name: string
  date?: string
  entries: SetlistEntry[]
  createdAt: number
  updatedAt: number
}

export interface ImportCandidate {
  fileName: string
  text: string
  parsed: ParseResult
  selected: boolean
  duplicateOf?: string
}

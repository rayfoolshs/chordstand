const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

const PITCH_CLASS: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  'E#': 5,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11,
  'B#': 0,
}

const ROOT = '([A-G](?:#|b)?)'
const QUALITY =
  '(?:maj|min|m|M|dim|aug|sus|add|no|omit|°|ø|Δ)?(?:[0-9#b+()\\-]|sus[24]|add[0-9]+|maj[0-9]+|dim[0-9]*|aug[0-9]*|6\\/9)*'
const CHORD_RE = new RegExp(`^${ROOT}(${QUALITY})(?:\\/${ROOT})?$`)
const KEY_RE = /^([A-G](?:#|b)?)\s*(m|min|minor)?$/i

export interface ParsedChord {
  root: string
  quality: string
  bass?: string
}

export interface ParsedKey {
  pitchClass: number
  minor: boolean
  preferFlats: boolean
}

export function parseChord(token: string): ParsedChord | null {
  const trimmed = token.trim()
  if (!trimmed) return null

  // "N.C." and percussion markings are not transposable chords.
  if (/^(n\.?c\.?|x|%)$/i.test(trimmed)) return null

  // ChordPro allows annotations inside brackets: "[Dm7 (play twice)]".
  const annotation = trimmed.match(/^([^\s(]+)\s*(\([^)]*\))?$/)
  const core = annotation ? annotation[1] : trimmed

  const match = core.match(CHORD_RE)
  if (!match) return null
  return {
    root: match[1],
    quality: match[2] ?? '',
    bass: match[3] || undefined,
  }
}

export function isChordToken(token: string): boolean {
  const trimmed = token.trim()
  if (!trimmed) return false
  if (isBarToken(trimmed)) return true
  return parseChord(trimmed) !== null
}

export function isBarToken(token: string): boolean {
  return /^(\||:|\|\||%|-|–|\(?\d+x\)?|x\d+)$/i.test(token.trim())
}

export function transposeChord(chord: string, semitones: number, preferFlats = false): string {
  if (semitones === 0 || semitones % 12 === 0) return chord
  const parsed = parseChord(chord)
  if (!parsed) return chord

  // Keep any trailing annotation ("Dm7 (play twice)") attached.
  const annotationMatch = chord.match(/\([^)]*\)\s*$/)
  const annotation = annotationMatch ? ` ${annotationMatch[0].trim()}` : ''
  const base = annotation ? chord.slice(0, chord.length - annotation.length) : chord

  const shift = (note: string) => {
    const pitch = PITCH_CLASS[note]
    if (pitch === undefined) return note
    const next = (((pitch + semitones) % 12) + 12) % 12
    return (preferFlats ? FLAT_NAMES : SHARP_NAMES)[next]
  }

  const rebuilt = base.replace(CHORD_RE, (_all, root: string, quality: string, bass?: string) => {
    const nextRoot = shift(root)
    const nextBass = bass ? `/${shift(bass)}` : ''
    return `${nextRoot}${quality}${nextBass}`
  })
  return `${rebuilt}${annotation}`
}

export function parseKey(key: string | undefined): ParsedKey | null {
  if (!key) return null
  const match = key.trim().match(KEY_RE)
  if (!match) return null
  const pitch = PITCH_CLASS[match[1]]
  if (pitch === undefined) return null
  return {
    pitchClass: pitch,
    minor: Boolean(match[2]),
    preferFlats: /b/.test(match[1]) || ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'].includes(match[1]),
  }
}

export function keyName(pitchClass: number, minor: boolean, preferFlats: boolean): string {
  const names = preferFlats ? FLAT_NAMES : SHARP_NAMES
  return `${names[((pitchClass % 12) + 12) % 12]}${minor ? 'm' : ''}`
}

/** Guitar-friendly spelling: flat keys where charts normally use flats. */
export function preferFlatsForPitchClass(pitchClass: number): boolean {
  return [1, 3, 5, 6, 8, 10].includes(((pitchClass % 12) + 12) % 12)
}

/** Number of semitones to move from one key to another. */
export function semitonesBetween(from: string | undefined, to: string | undefined): number {
  const a = parseKey(from)
  const b = parseKey(to)
  if (!a || !b) return 0
  return (((b.pitchClass - a.pitchClass) % 12) + 12) % 12
}

export interface KeyOption {
  value: string
  label: string
}

export function keyOptions(minor: boolean): KeyOption[] {
  const flats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
  const sharps = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  // Prefer the spelling that keeps common keys readable, then offer the
  // enharmonic alternative for each rooted pitch class.
  return flats.map((flat, index) => {
    const sharp = sharps[index]
    const label = minor ? `${flat}m` : flat
    const alt = minor ? `${sharp}m` : sharp
    return {
      value: label,
      label: flat === sharp ? label : `${label} / ${alt}`,
    }
  })
}

/** The chord shapes to play when a capo is fitted. */
export function chordForCapo(chord: string, capo: number, preferFlats: boolean): string {
  return transposeChord(chord, -capo, preferFlats)
}

export function capoKeyName(originalKey: string | undefined, capo: number): string | undefined {
  const key = parseKey(originalKey)
  if (!key || !capo) return originalKey
  return keyName(key.pitchClass - capo, key.minor, key.preferFlats)
}

export function formatDuration(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return ''
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
}

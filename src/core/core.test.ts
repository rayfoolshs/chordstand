import { describe, expect, it } from 'vitest'
import { parseSong, songToOnsong } from './parser'
import { candidateFromText, songFromCandidate } from './import'
import { isChordToken, keyName, semitonesBetween, transposeChord } from './chords'

describe('OnSong parsing', () => {
  const source = `Title: Amazing Grace
Artist: John Newton
Key: G
Capo: 2
Tempo: 76
Time: 3/4
Duration: 4:00
Book: Hymns, Sunday
Keywords: hymn; acoustic

[Verse 1]
G       C
Amazing grace
[G]how sweet the sound
`

  it('reads metadata', () => {
    const result = parseSong(source, { fileName: 'amazing.onsong' })
    expect(result.title).toBe('Amazing Grace')
    expect(result.artist).toBe('John Newton')
    expect(result.meta.key).toBe('G')
    expect(result.meta.capo).toBe(2)
    expect(result.meta.tempo).toBe(76)
    expect(result.meta.time).toBe('3/4')
    expect(result.meta.duration).toBe(240)
    expect(result.meta.books).toEqual(['Hymns', 'Sunday'])
    expect(result.meta.tags).toEqual(['hymn', 'acoustic'])
  })

  it('parses sections, chords-over-lyrics and bracketed chords', () => {
    const result = parseSong(source)
    expect(result.lines[0]).toEqual({ kind: 'section', label: 'Verse 1' })

    const first = result.lines[1]
    expect(first.kind).toBe('lyric')
    if (first.kind !== 'lyric') return
    expect(first.segments).toEqual([
      { chord: 'G', text: 'Amazing ' },
      { chord: 'C', text: 'grace' },
    ])

    const second = result.lines[2]
    expect(second.kind).toBe('lyric')
    if (second.kind !== 'lyric') return
    expect(second.segments[0]).toEqual({ chord: 'G', text: 'how sweet the sound' })
  })

  it('uses title/artist shorthand with no metadata tags at all', () => {
    const result = parseSong(`Amazing Grace
John Newton

[G]Amazing grace how sweet the sound`)
    expect(result.title).toBe('Amazing Grace')
    expect(result.artist).toBe('John Newton')
  })

  it('uses title/artist shorthand when a metadata tag is present', () => {
    const result = parseSong(`Amazing Grace
John Newton
Key: G

[G]lyrics`)
    expect(result.title).toBe('Amazing Grace')
    expect(result.artist).toBe('John Newton')
    expect(result.meta.key).toBe('G')
  })

  it('falls back to the file name instead of guessing a lyric', () => {
    const result = parseSong(`[Verse]
[G]Hello there`, { fileName: 'My Song.onsong' })
    expect(result.title).toBe('My Song')
    expect(result.lines[0]).toEqual({ kind: 'section', label: 'Verse' })
  })

  it('reads ChordPro directives without blank lines', () => {
    const result = parseSong(`{title: Test Song}
{artist: Someone}
{key: D}
{start_of_chorus}
[D]Hello [A]world
{end_of_chorus}`)
    expect(result.title).toBe('Test Song')
    expect(result.artist).toBe('Someone')
    expect(result.meta.key).toBe('D')
    expect(result.lines[0]).toEqual({ kind: 'section', label: 'Chorus' })
    const lyric = result.lines[1]
    expect(lyric.kind).toBe('lyric')
    if (lyric.kind === 'lyric') {
      expect(lyric.segments[0]).toEqual({ chord: 'D', text: 'Hello ' })
      expect(lyric.segments[1]).toEqual({ chord: 'A', text: 'world' })
    }
  })

  it('accumulates inline transpose offsets', () => {
    const result = parseSong(`Key: G

{transpose: 2}
[G]Hello`)
    const lyric = result.lines.find((line) => line.kind === 'lyric')
    expect(lyric && lyric.kind === 'lyric' ? lyric.offset : null).toBe(2)
  })

  it('does not mistake two-word lyrics for chords', () => {
    const result = parseSong(`Key: G

Amazing Grace
How sweet the sound`)
    expect(result.lines.every((line) => line.kind === 'lyric')).toBe(true)
  })

  it('detects a key from the first chord when metadata is missing', () => {
    const result = parseSong(`[Em]Hello [C]world`)
    expect(result.meta.key).toBe('Em')
  })
})

describe('chord theory', () => {
  it('transposes roots, qualities and slash basses', () => {
    expect(transposeChord('C', 2)).toBe('D')
    expect(transposeChord('Am7', 3)).toBe('Cm7')
    expect(transposeChord('F#m7b5', 1)).toBe('Gm7b5')
    expect(transposeChord('Bb/D', 2)).toBe('C/E')
    expect(transposeChord('Dm7 (play twice)', 2)).toBe('Em7 (play twice)')
    expect(transposeChord('N.C.', 2)).toBe('N.C.')
  })

  it('respects flat spelling when asked', () => {
    expect(transposeChord('C', 1, true)).toBe('Db')
    expect(transposeChord('C', 1, false)).toBe('C#')
    expect(keyName(10, false, true)).toBe('Bb')
    expect(keyName(1, true, false)).toBe('C#m')
  })

  it('computes semitones between keys', () => {
    expect(semitonesBetween('G', 'A')).toBe(2)
    expect(semitonesBetween('A', 'G')).toBe(10)
    expect(semitonesBetween('Em', 'Am')).toBe(5)
    expect(semitonesBetween(undefined, 'C')).toBe(0)
  })

  it('recognises valid chords and rejects words', () => {
    expect(isChordToken('Cmaj7')).toBe(true)
    expect(isChordToken('F#m7b5')).toBe(true)
    expect(isChordToken('Csus4/G')).toBe(true)
    expect(isChordToken('|')).toBe(true)
    expect(isChordToken('Amazing')).toBe(false)
    expect(isChordToken('Glorious')).toBe(false)
    expect(isChordToken('Chorus')).toBe(false)
  })
})

describe('import round trip', () => {
  it('keeps metadata and body when exporting to .onsong', () => {
    const source = `Title: Test Song
Artist: The Band
Key: Bb
Capo: 3
Tempo: 92
Keywords: rehearsed, upbeat

[Verse]
[Bb]First line
[Eb]Second line
`
    const candidate = candidateFromText('test.onsong', source)
    const song = songFromCandidate(candidate)
    const exported = songToOnsong(song)

    expect(exported).toContain('Title: Test Song')
    expect(exported).toContain('Artist: The Band')
    expect(exported).toContain('Key: Bb')
    expect(exported).toContain('Capo: 3')
    expect(exported).toContain('Keywords: rehearsed, upbeat')
    expect(exported).toContain('[Bb]First line')
  })

  it('keeps the body when a ChordPro file has no blank line', () => {
    const source = `{title: No Blank}
{key: G}
{start_of_verse}
[G]Hello`
    const song = songFromCandidate(candidateFromText('noblank.onsong', source))
    const exported = songToOnsong(song)
    expect(exported).toContain('[G]Hello')
  })

  it('flags duplicates by title and artist', () => {
    const source = `Title: Same
Artist: Person
Key: G

[G]Words`
    const existing = [songFromCandidate(candidateFromText('a.onsong', source))]
    const candidate = candidateFromText('b.onsong', source, existing)
    expect(candidate.duplicateOf).toBe(existing[0].id)
    expect(candidate.selected).toBe(false)
  })
})

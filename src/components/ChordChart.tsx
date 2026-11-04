import { useMemo, type CSSProperties } from 'react'
import { parseSong } from '../core/parser'
import { isBarToken, parseKey, preferFlatsForPitchClass, semitonesBetween, transposeChord } from '../core/chords'
import type { ChartLine, Song } from '../core/types'

interface ChordChartProps {
  song: Song
  targetKey: string
  capo: number
  fontSize: number
  showChords: boolean
}

export function ChordChart({ song, targetKey, capo, fontSize, showChords }: ChordChartProps) {
  const parsed = useMemo(
    () => parseSong(song.source, { fileName: song.title, format: song.format }),
    [song.source, song.title, song.format],
  )

  const semitones = useMemo(
    () => semitonesBetween(song.key, targetKey),
    [song.key, targetKey],
  )
  const target = parseKey(targetKey)
  const preferFlats = target ? preferFlatsForPitchClass(target.pitchClass - capo) : false

  const displayChord = (chord: string, offset: number): string => {
    if (isBarToken(chord)) return chord
    return transposeChord(chord, offset + semitones - capo, preferFlats)
  }

  const style = { '--chart-size': `${fontSize}px` } as CSSProperties

  return (
    <div className="chart" style={style}>
      {parsed.lines.map((line, index) => renderLine(line, index, displayChord, showChords))}
      <div className="chart-end" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      {(song.copyright || song.ccli || song.author) && (
        <div className="chart-footer">
          {song.author ? <span>Chart: {song.author}</span> : null}
          {song.copyright ? <span>{song.copyright}</span> : null}
          {song.ccli ? <span>CCLI {song.ccli}</span> : null}
        </div>
      )}
    </div>
  )
}

function renderLine(
  line: ChartLine,
  index: number,
  displayChord: (chord: string, offset: number) => string,
  showChords: boolean,
) {
  switch (line.kind) {
    case 'section':
      return (
        <div className="chart-section" key={index}>
          <span>{line.label}</span>
        </div>
      )

    case 'comment':
      return (
        <div className="chart-comment" key={index}>
          {line.text}
        </div>
      )

    case 'blank':
      return <div className="chart-gap" key={index} />

    case 'pagebreak':
      return (
        <div className="chart-pagebreak" key={index}>
          <span>Page break</span>
        </div>
      )

    case 'chords':
      return (
        <div className="chart-line chart-line-chords" key={index}>
          {line.segments.map((segment, segmentIndex) => (
            <span className="seg" key={segmentIndex}>
              <span className="chord">{segment.chord ? displayChord(segment.chord, line.offset) : '\u00a0'}</span>
            </span>
          ))}
        </div>
      )

    case 'lyric':
      return (
        <div className="chart-line" key={index}>
          {line.segments.map((segment, segmentIndex) => (
            <span className="seg" key={segmentIndex}>
              <span className="chord">
                {showChords && segment.chord ? displayChord(segment.chord, line.offset) : '\u00a0'}
              </span>
              <span className="lyric">{segment.text || '\u00a0'}</span>
            </span>
          ))}
        </div>
      )
  }
}

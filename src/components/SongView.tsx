import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Setlist, SetlistEntry, Song } from '../core/types'
import { formatDuration, keyName, keyOptions, parseKey, preferFlatsForPitchClass } from '../core/chords'
import { downloadText, safeFileName } from '../core/import'
import { songToOnsong } from '../core/parser'
import { useAutoscroll, useFullscreen, usePerformanceHotkeys, useWakeLock } from '../hooks/useStage'
import { useSettings } from '../store/useSettings'
import { useStore } from '../store/useStore'
import { ChordChart } from './ChordChart'
import { Icon } from './Icon'
import { SongEditor } from './SongEditor'

interface SongViewProps {
  song: Song
  setlist?: Setlist
  entry?: SetlistEntry
  entryIndex?: number
  onBack: () => void
  onOpenEntry: (entryId: string) => void
  onOpenEditor: (entry: SetlistEntry) => void
}

export function SongView({
  song,
  setlist,
  entry,
  entryIndex,
  onBack,
  onOpenEntry,
  onOpenEditor,
}: SongViewProps) {
  const settings = useSettings()
  const touchSong = useStore((state) => state.touchSong)
  const updateEntry = useStore((state) => state.updateEntry)

  const minor = parseKey(song.key)?.minor ?? false
  const keyChoices = useMemo(() => {
    const options = keyOptions(minor)
    if (!options.some((option) => option.value === initialKey(song, entry, settings.songKeys))) {
      options.unshift({ value: initialKey(song, entry, settings.songKeys), label: initialKey(song, entry, settings.songKeys) })
    }
    return options
  }, [minor, song, entry, settings.songKeys])

  const [targetKey, setTargetKey] = useState(() => initialKey(song, entry, settings.songKeys))
  const [capo, setCapo] = useState(() => entry?.capo ?? settings.songCapos[song.id] ?? song.capo ?? 0)
  const [scrolling, setScrolling] = useState(false)
  const [speed, setSpeed] = useState(() => settings.scrollSpeeds[song.id] ?? 28)
  const [progress, setProgress] = useState(0)
  const [showControls, setShowControls] = useState(settings.showControls)
  const [savedToSet, setSavedToSet] = useState(false)
  const [editing, setEditing] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const { toggle: toggleFullscreen } = useFullscreen()

  useWakeLock(scrolling)
  useAutoscroll(scrollRef, {
    active: scrolling,
    speed,
    onFinished: () => setScrolling(false),
  })

  useEffect(() => {
    void touchSong(song.id)
    setProgress(0)
  }, [song.id, touchSong])

  useEffect(() => {
    document.title = `${song.title} — Chordstand`
    return () => {
      document.title = 'Chordstand'
    }
  }, [song.title])

  // Derive a scroll speed from the chart length when the song has a duration.
  useEffect(() => {
    if (!scrolling || !song.duration) return
    if (settings.scrollSpeeds[song.id]) return
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.clientHeight
    if (distance <= 0) return
    const derived = Math.min(240, Math.max(4, distance / song.duration))
    setSpeed(Number(derived.toFixed(1)))
  }, [scrolling, song.duration, song.id, settings.scrollSpeeds])

  const entryCount = setlist?.entries.length ?? 0
  const canPrevious = entryIndex !== undefined && entryIndex > 0
  const canNext = entryIndex !== undefined && entryIndex < entryCount - 1

  const page = useCallback((direction: -1 | 1) => {
    const element = scrollRef.current
    if (!element) return
    element.scrollBy({ top: direction * element.clientHeight * 0.85, behavior: 'smooth' })
  }, [])

  const goToEntry = useCallback(
    (index: number) => {
      const next = setlist?.entries[index]
      if (next) onOpenEntry(next.id)
    },
    [setlist, onOpenEntry],
  )

  const atBottom = () => {
    const element = scrollRef.current
    return !element || element.scrollTop + element.clientHeight >= element.scrollHeight - 8
  }

  const atTop = () => !scrollRef.current || scrollRef.current.scrollTop <= 8

  usePerformanceHotkeys({
    onToggleScroll: () => setScrolling((value) => !value),
    onPage: page,
    onNextSong: canNext
      ? () => {
          if (atBottom()) goToEntry((entryIndex ?? 0) + 1)
          else page(1)
        }
      : undefined,
    onPreviousSong: canPrevious
      ? () => {
          if (atTop()) goToEntry((entryIndex ?? 0) - 1)
          else page(-1)
        }
      : undefined,
    onTop: () => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }),
    onBottom: () => {
      const element = scrollRef.current
      if (element) element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
    },
    onFullscreen: toggleFullscreen,
  })

  const handleScroll = () => {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.clientHeight
    setProgress(distance > 0 ? Math.min(1, Math.max(0, element.scrollTop / distance)) : 0)
  }

  const changeKey = (key: string) => {
    setTargetKey(key)
    settings.rememberKey(song.id, key)
  }

  const changeCapo = (next: number) => {
    const bounded = Math.min(11, Math.max(0, next))
    setCapo(bounded)
    settings.rememberCapo(song.id, bounded)
  }

  const changeSpeed = (next: number) => {
    setSpeed(next)
    settings.rememberSpeed(song.id, next)
  }

  const exportSong = () => {
    downloadText(`${safeFileName(`${song.title}${song.artist ? ` - ${song.artist}` : ''}`)}.onsong`, songToOnsong(song))
  }

  const pinToSet = () => {
    if (!setlist || !entry) return
    void updateEntry(setlist.id, entry.id, { key: targetKey, capo })
    setSavedToSet(true)
    window.setTimeout(() => setSavedToSet(false), 1800)
  }

  const capoShape = capo > 0 ? `Capo ${capo}` : 'No capo'
  const nextEntry = setlist && entryIndex !== undefined ? setlist.entries[entryIndex + 1] : undefined
  const allSongs = useStore((state) => state.songs)
  const nextSong = nextEntry ? allSongs.find((item) => item.id === nextEntry.songId) : undefined
  const parsedTarget = parseKey(targetKey)
  const shapeKey = parsedTarget
    ? keyName(
        parsedTarget.pitchClass - capo,
        parsedTarget.minor,
        preferFlatsForPitchClass(parsedTarget.pitchClass - capo),
      )
    : targetKey

  return (
    <div className={`song-screen ${scrolling ? 'is-scrolling' : ''}`}>
      <header className="song-topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <div className="song-heading">
          <h1>{song.title}</h1>
          <p>
            {song.artist || ' '}
            {song.tempo ? ` · ${song.tempo} bpm` : ''}
            {song.time ? ` · ${song.time}` : ''}
            {song.duration ? ` · ${formatDuration(song.duration)}` : ''}
          </p>
        </div>
        <button className="icon-btn" onClick={exportSong} aria-label="Export chart">
          <Icon name="download" />
        </button>
        <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit chart">
          <Icon name="edit" />
        </button>
        <button
          className="icon-btn"
          onClick={() => setShowControls((value) => !value)}
          aria-label={showControls ? 'Hide controls' : 'Show controls'}
        >
          <Icon name={showControls ? 'shrink' : 'sliders'} />
        </button>
      </header>

      {showControls && (
        <div className="song-controls">
          <label className="field">
            <span>Key</span>
            <select value={targetKey} onChange={(event) => changeKey(event.target.value)}>
              {keyChoices.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>

          <div className="field stepper">
            <span>Capo</span>
            <div className="stepper-inner">
              <button onClick={() => changeCapo(capo - 1)} disabled={capo <= 0} aria-label="Capo down">
                −
              </button>
              <strong>{capo}</strong>
              <button onClick={() => changeCapo(capo + 1)} disabled={capo >= 11} aria-label="Capo up">
                +
              </button>
            </div>
          </div>

          <div className="field font-control">
            <span>Size</span>
            <div className="stepper-inner">
              <button onClick={() => settings.setFontSize(settings.fontSize - 2)} aria-label="Smaller text">
                <Icon name="fontMinus" size={18} />
              </button>
              <strong>{settings.fontSize}</strong>
              <button onClick={() => settings.setFontSize(settings.fontSize + 2)} aria-label="Larger text">
                <Icon name="fontPlus" size={18} />
              </button>
            </div>
          </div>

          <button
            className="ghost-button"
            onClick={settings.toggleChords}
            aria-pressed={settings.showChords}
            title={settings.showChords ? 'Hide chord symbols' : 'Show chord symbols'}
          >
            <Icon name="music" size={16} />
            {settings.showChords ? 'Chords on' : 'Lyrics only'}
          </button>

          <button
            className={`scroll-button ${scrolling ? 'active' : ''}`}
            onClick={() => setScrolling((value) => !value)}
          >
            <Icon name={scrolling ? 'pause' : 'play'} size={18} />
            {scrolling ? 'Pause' : 'Scroll'}
          </button>

          <label className="field speed">
            <span>
              Speed <em>{Math.round(speed)} px/s</em>
            </span>
            <input
              type="range"
              min={4}
              max={300}
              step={1}
              value={speed}
              onChange={(event) => changeSpeed(Number(event.target.value))}
            />
          </label>

          {entry && (
            <button className="ghost-button" onClick={pinToSet}>
              <Icon name={savedToSet ? 'check' : 'list'} size={18} />
              {savedToSet ? 'Saved' : 'Pin to set'}
            </button>
          )}

          <button className="icon-btn" onClick={toggleFullscreen} aria-label="Fullscreen">
            <Icon name="expand" />
          </button>

          <button
            className="icon-btn"
            onClick={settings.toggleAppearance}
            aria-label={settings.appearance >= 50 ? 'Switch to night mode' : 'Switch to daylight mode'}
            title={settings.appearance >= 50 ? 'Switch to night mode' : 'Switch to daylight mode'}
          >
            <Icon name={settings.appearance >= 50 ? 'moon' : 'sun'} />
          </button>
        </div>
      )}

      <div className="chart-wrapper">
        <div className="chart-scroll" ref={scrollRef} onScroll={handleScroll}>
          <div className="chart-inner">
            <div className="chart-meta">
              <span className="chip strong">{capo > 0 ? `${capoShape} · play in ${shapeKey}` : targetKey}</span>
              {song.books.map((book) => (
                <span className="chip" key={book}>
                  {book}
                </span>
              ))}
              {song.tags.slice(0, 4).map((tag) => (
                <span className="chip subtle" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
            <ChordChart
              song={song}
              targetKey={targetKey}
              capo={capo}
              fontSize={settings.fontSize}
              showChords={settings.showChords}
            />
            <div className="scroll-pad" />
          </div>
        </div>
        <div className="progress" aria-hidden="true">
          <span style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {setlist && entryIndex !== undefined && (
        <footer className="setlist-bar">
          <button className="icon-btn" onClick={() => entry && onOpenEditor(entry)} aria-label="Edit this set entry">
            <Icon name="sliders" />
          </button>
          <button
            className="setlist-nav"
            onClick={() => goToEntry(entryIndex - 1)}
            disabled={!canPrevious}
          >
            <Icon name="chevronLeft" size={18} />
            Previous
          </button>
          <span className="setlist-position">
            {entryIndex + 1} / {entryCount}
            {nextSong ? <em>Next: {nextSong.title}</em> : <em>Last song</em>}
          </span>
          <button className="setlist-nav" onClick={() => goToEntry(entryIndex + 1)} disabled={!canNext}>
            Next
            <Icon name="chevronRight" size={18} />
          </button>
        </footer>
      )}

      {editing && <SongEditor song={song} onClose={() => setEditing(false)} />}
    </div>
  )
}

function initialKey(song: Song, entry: SetlistEntry | undefined, saved: Record<string, string>): string {
  return entry?.key ?? saved[song.id] ?? song.transposedKey ?? song.key ?? 'C'
}

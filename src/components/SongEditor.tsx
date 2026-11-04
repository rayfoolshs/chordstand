import { useState } from 'react'
import type { Song } from '../core/types'
import { parseSong } from '../core/parser'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { Modal } from './Modal'

export function SongEditor({ song, onClose }: { song: Song; onClose: () => void }) {
  const updateSong = useStore((state) => state.updateSong)

  const [title, setTitle] = useState(song.title)
  const [artist, setArtist] = useState(song.artist)
  const [key, setKey] = useState(song.key ?? '')
  const [capo, setCapo] = useState(String(song.capo ?? ''))
  const [tempo, setTempo] = useState(String(song.tempo ?? ''))
  const [time, setTime] = useState(song.time ?? '')
  const [duration, setDuration] = useState(song.duration ? String(song.duration) : '')
  const [books, setBooks] = useState(song.books.join(', '))
  const [tags, setTags] = useState(song.tags.join(', '))
  const [source, setSource] = useState(song.source)
  const [notice, setNotice] = useState('')

  const reread = () => {
    const parsed = parseSong(source, { fileName: `${title || 'song'}.onsong` })
    if (parsed.title) setTitle(parsed.title)
    if (parsed.artist) setArtist(parsed.artist)
    if (parsed.meta.key) setKey(parsed.meta.key)
    if (parsed.meta.capo !== undefined) setCapo(String(parsed.meta.capo))
    if (parsed.meta.tempo !== undefined) setTempo(String(parsed.meta.tempo))
    if (parsed.meta.time) setTime(parsed.meta.time)
    if (parsed.meta.duration !== undefined) setDuration(String(parsed.meta.duration))
    if (parsed.meta.books?.length) setBooks(parsed.meta.books.join(', '))
    if (parsed.meta.tags?.length) setTags(parsed.meta.tags.join(', '))
    setNotice(
      parsed.warnings.length ? parsed.warnings.join(' · ') : 'Metadata re-read from the chart text.',
    )
  }

  const save = () => {
    const list = (value: string) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)

    void updateSong(song.id, {
      title: title.trim() || song.title,
      artist: artist.trim(),
      key: key.trim() || undefined,
      capo: capo.trim() ? Number(capo) : undefined,
      tempo: tempo.trim() ? Number(tempo) : undefined,
      time: time.trim() || undefined,
      duration: duration.trim() ? Number(duration) : undefined,
      books: list(books),
      tags: list(tags),
      source,
    })
    onClose()
  }

  return (
    <Modal
      open
      wide
      title="Edit chart"
      onClose={onClose}
      footer={
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" onClick={save}>
            Save chart
          </button>
        </div>
      }
    >
      <div className="editor-grid">
        <label className="field">
          <span>Title</span>
          <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field">
          <span>Artist</span>
          <input type="text" value={artist} onChange={(event) => setArtist(event.target.value)} />
        </label>
        <label className="field">
          <span>Key</span>
          <input type="text" value={key} onChange={(event) => setKey(event.target.value)} placeholder="G, Bb, Em" />
        </label>
        <label className="field">
          <span>Capo</span>
          <input type="text" inputMode="numeric" value={capo} onChange={(event) => setCapo(event.target.value)} />
        </label>
        <label className="field">
          <span>Tempo</span>
          <input type="text" inputMode="numeric" value={tempo} onChange={(event) => setTempo(event.target.value)} />
        </label>
        <label className="field">
          <span>Time</span>
          <input type="text" value={time} onChange={(event) => setTime(event.target.value)} placeholder="4/4" />
        </label>
        <label className="field">
          <span>Duration (seconds)</span>
          <input
            type="text"
            inputMode="numeric"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Books</span>
          <input type="text" value={books} onChange={(event) => setBooks(event.target.value)} placeholder="Hymns, Sunday" />
        </label>
        <label className="field wide">
          <span>Tags</span>
          <input type="text" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="hymn, acoustic" />
        </label>
      </div>

      <div className="editor-source">
        <div className="editor-source-head">
          <span className="sheet-label">Chart text</span>
          <button className="ghost-button small-button" onClick={reread}>
            <Icon name="download" size={15} />
            Re-read metadata
          </button>
        </div>
        <textarea
          spellCheck={false}
          rows={16}
          value={source}
          onChange={(event) => setSource(event.target.value)}
        />
        {notice ? <p className="fine-print">{notice}</p> : null}
        <p className="fine-print">
          Keep chords in brackets or aligned above lyrics. Metadata you set above wins when exporting.
        </p>
      </div>
    </Modal>
  )
}

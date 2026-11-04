import { useMemo, useState } from 'react'
import type { Song } from '../core/types'
import { DEMO_SONG, DEMO_SONG_TWO } from '../core/demo'
import {
  buildBackupZip,
  buildLibraryZip,
  candidateFromText,
  downloadBytes,
  downloadText,
  safeFileName,
  songFromCandidate,
} from '../core/import'
import { songToOnsong } from '../core/parser'
import { useSettings } from '../store/useSettings'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { SongEditor } from './SongEditor'

type SortMode = 'title' | 'artist' | 'recent'

export function Library({
  onOpenSong,
  onImport,
  onSetlists,
}: {
  onOpenSong: (songId: string) => void
  onImport: () => void
  onSetlists: () => void
}) {
  const songs = useStore((state) => state.songs)
  const setlists = useStore((state) => state.setlists)
  const addSongs = useStore((state) => state.addSongs)
  const deleteSongs = useStore((state) => state.deleteSongs)
  const addToSetlist = useStore((state) => state.addToSetlist)
  const settings = useSettings()

  const [query, setQuery] = useState('')
  const [book, setBook] = useState('all')
  const [sort, setSort] = useState<SortMode>('title')
  const [actionSong, setActionSong] = useState<Song | null>(null)
  const [editingSong, setEditingSong] = useState<Song | null>(null)
  const [libraryMenu, setLibraryMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const books = useMemo(() => {
    const counts = new Map<string, number>()
    songs.forEach((song) => {
      song.books.forEach((item) => counts.set(item, (counts.get(item) ?? 0) + 1))
    })
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [songs])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let list = songs.filter((song) => {
      if (book !== 'all' && !song.books.includes(book)) return false
      if (!needle) return true
      const haystack = [
        song.title,
        song.artist,
        song.author,
        song.key,
        song.tags.join(' '),
        song.books.join(' '),
        song.source,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
    list = [...list]
    if (sort === 'artist') {
      list.sort(
        (a, b) =>
          a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' }) ||
          a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
      )
    } else if (sort === 'recent') {
      list.sort((a, b) => (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt))
    } else {
      list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
    }
    return list
  }, [songs, query, book, sort])

  const addDemo = () => {
    const candidates = [DEMO_SONG, DEMO_SONG_TWO]
      .map((text, index) => candidateFromText(index === 0 ? 'Amazing Grace.onsong' : 'Wagon Wheel.onsong', text, songs))
      .filter((candidate) => !candidate.duplicateOf)
      .map((candidate) => songFromCandidate(candidate))
    if (candidates.length) void addSongs(candidates)
    setLibraryMenu(false)
  }

  const exportSong = (song: Song) => {
    downloadText(`${safeFileName(`${song.title}${song.artist ? ` - ${song.artist}` : ''}`)}.onsong`, songToOnsong(song))
  }

  return (
    <div className="screen">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="music" size={20} />
          </span>
          <div>
            <h1>Chordstand</h1>
            <p>
              {songs.length} {songs.length === 1 ? 'song' : 'songs'}
              {setlists.length ? ` · ${setlists.length} sets` : ''}
            </p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button" onClick={onSetlists}>
            <Icon name="list" size={18} />
            Set lists
          </button>
          <button className="primary-button" onClick={onImport}>
            <Icon name="upload" size={18} />
            Import
          </button>
          <button className="icon-btn" onClick={() => setLibraryMenu(true)} aria-label="Library menu">
            <Icon name="more" />
          </button>
        </div>
      </header>

      <div className="library-tools">
        <label className="search">
          <Icon name="search" size={18} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, artist, lyric, tag…"
            autoComplete="off"
          />
        </label>
        <div className="tool-row">
          {books.length > 0 && (
            <select className="compact-select" value={book} onChange={(event) => setBook(event.target.value)}>
              <option value="all">All books</option>
              {books.map(([name, count]) => (
                <option value={name} key={name}>
                  {name} ({count})
                </option>
              ))}
            </select>
          )}
          <select
            className="compact-select"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortMode)}
          >
            <option value="title">Title A–Z</option>
            <option value="artist">Artist A–Z</option>
            <option value="recent">Recently opened</option>
          </select>
          <span className="result-count">{filtered.length} shown</span>
        </div>
      </div>

      {songs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-mark">
            <Icon name="music" size={34} />
          </div>
          <h2>Bring your library with you</h2>
          <p>
            Drop in a zip of your OnSong files, pick individual <code>.onsong</code> charts, or paste a chart from
            anywhere. Everything is parsed and previewed before it is saved.
          </p>
          <div className="empty-actions">
            <button className="primary-button" onClick={onImport}>
              <Icon name="upload" size={18} />
              Import songs
            </button>
            <button className="ghost-button" onClick={addDemo}>
              Add demo songs
            </button>
          </div>
          <p className="fine-print">Offline-first. Your charts never leave this device.</p>
        </div>
      ) : (
        <div className="song-list">
          {filtered.map((song) => (
            <div
              className="song-row"
              key={song.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenSong(song.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onOpenSong(song.id)
              }}
            >
              <div className="song-main">
                <span className="song-title">{song.title}</span>
                <span className="song-artist">{song.artist || 'Unknown artist'}</span>
              </div>
              <div className="song-tags">
                {song.books.slice(0, 2).map((item) => (
                  <span className="chip subtle" key={item}>
                    {item}
                  </span>
                ))}
                {song.tags.slice(0, 1).map((tag) => (
                  <span className="chip subtle" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
              <div className="song-meta">
                <span className="chip strong">{song.key ?? '—'}</span>
                {song.capo ? <span className="chip">capo {song.capo}</span> : null}
                {song.tempo ? <span className="tempo">{song.tempo} bpm</span> : null}
              </div>
              <button
                className="icon-btn"
                aria-label={`Actions for ${song.title}`}
                onClick={(event) => {
                  event.stopPropagation()
                  setActionSong(song)
                  setConfirmDelete(false)
                }}
              >
                <Icon name="more" />
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="no-results">
              <p>No songs match “{query}”.</p>
            </div>
          )}
        </div>
      )}

      <Modal open={Boolean(actionSong)} title={actionSong?.title} onClose={() => setActionSong(null)}>
        {actionSong && (
          <div className="stack">
            <p className="muted">
              {actionSong.artist || 'Unknown artist'} · {actionSong.key ?? 'No key'}
              {actionSong.capo ? ` · capo ${actionSong.capo}` : ''}
            </p>

            <button className="sheet-row" onClick={() => onOpenSong(actionSong.id)}>
              <Icon name="music" size={18} />
              Open chart
            </button>

            <button
              className="sheet-row"
              onClick={() => {
                setEditingSong(actionSong)
                setActionSong(null)
              }}
            >
              <Icon name="edit" size={18} />
              Edit chart & metadata
            </button>

            <div className="sheet-section">
              <span className="sheet-label">Add to set list</span>
              {setlists.length === 0 ? (
                <p className="muted small">Create a set list first from the Set lists screen.</p>
              ) : (
                <div className="chip-wrap">
                  {setlists.map((setlist) => (
                    <button
                      className="ghost-button"
                      key={setlist.id}
                      onClick={() => {
                        void addToSetlist(setlist.id, actionSong.id)
                        setActionSong(null)
                      }}
                    >
                      <Icon name="plus" size={16} />
                      {setlist.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              className="sheet-row"
              onClick={() => {
                exportSong(actionSong)
                setActionSong(null)
              }}
            >
              <Icon name="download" size={18} />
              Export as .onsong
            </button>

            {confirmDelete ? (
              <div className="danger-row">
                <span>Delete this song?</span>
                <button
                  className="danger-button"
                  onClick={() => {
                    void deleteSongs([actionSong.id])
                    setActionSong(null)
                  }}
                >
                  Delete
                </button>
                <button className="ghost-button" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="sheet-row danger" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" size={18} />
                Delete song
              </button>
            )}
          </div>
        )}
      </Modal>

      <Modal open={libraryMenu} title="Library" onClose={() => setLibraryMenu(false)}>
        <div className="stack">
          <button
            className="sheet-row"
            onClick={() => {
              downloadBytes('chordstand-library.zip', buildLibraryZip(songs))
              setLibraryMenu(false)
            }}
          >
            <Icon name="download" size={18} />
            Export all songs (.onsong zip)
          </button>
          <button
            className="sheet-row"
            onClick={() => {
              downloadBytes('chordstand-backup.zip', buildBackupZip(songs, setlists))
              setLibraryMenu(false)
            }}
          >
            <Icon name="download" size={18} />
            Download full backup
          </button>
          <div className="sheet-row static">
            <Icon name={settings.theme === 'night' ? 'sliders' : 'check'} size={18} />
            <span>Appearance</span>
            <select
              className="compact-select"
              value={settings.theme}
              onChange={(event) => settings.setTheme(event.target.value as 'night' | 'day')}
            >
              <option value="night">Night stage</option>
              <option value="day">Daylight</option>
            </select>
          </div>
          <button className="sheet-row" onClick={addDemo}>
            <Icon name="music" size={18} />
            Add demo songs
          </button>
          <p className="fine-print">
            Songs are stored in this browser. Install Chordstand to your home screen, and download a backup after big
            imports.
          </p>
        </div>
      </Modal>

      {editingSong && <SongEditor song={editingSong} onClose={() => setEditingSong(null)} />}
    </div>
  )
}

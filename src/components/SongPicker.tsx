import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { Modal } from './Modal'

export function SongPicker({
  open,
  onClose,
  onPick,
  title = 'Add songs',
}: {
  open: boolean
  onClose: () => void
  onPick: (songId: string) => void
  title?: string
}) {
  const songs = useStore((state) => state.songs)
  const [query, setQuery] = useState('')
  const [added, setAdded] = useState<string[]>([])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return songs
    return songs.filter((song) =>
      `${song.title} ${song.artist} ${song.tags.join(' ')}`.toLowerCase().includes(needle),
    )
  }, [songs, query])

  const close = () => {
    setQuery('')
    setAdded([])
    onClose()
  }

  return (
    <Modal open={open} title={title} onClose={close} wide>
      <label className="search modal-search">
        <Icon name="search" size={18} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a song…"
          autoFocus
        />
      </label>
      <div className="picker-list">
        {filtered.map((song) => (
          <button
            className="picker-row"
            key={song.id}
            onClick={() => {
              onPick(song.id)
              setAdded((current) => [...current, song.id])
            }}
          >
            <span className="picker-main">
              <strong>{song.title}</strong>
              <em>{song.artist || 'Unknown artist'}</em>
            </span>
            {song.key ? <span className="chip">{song.key}</span> : null}
            {added.includes(song.id) ? (
              <span className="chip strong">
                <Icon name="check" size={14} /> Added
              </span>
            ) : (
              <Icon name="plus" size={18} />
            )}
          </button>
        ))}
        {filtered.length === 0 && <p className="muted center">No songs found.</p>}
      </div>
      <div className="modal-actions">
        <button className="primary-button" onClick={close}>
          Done
        </button>
      </div>
    </Modal>
  )
}

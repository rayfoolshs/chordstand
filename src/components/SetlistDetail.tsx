import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { SongPicker } from './SongPicker'
import { EntryEditor } from './EntryEditor'

export function SetlistDetail({
  setlistId,
  onBack,
  onOpenEntry,
}: {
  setlistId: string
  onBack: () => void
  onOpenEntry: (entryId: string) => void
}) {
  const setlist = useStore((state) => state.setlists.find((item) => item.id === setlistId))
  const songs = useStore((state) => state.songs)
  const addToSetlist = useStore((state) => state.addToSetlist)
  const moveEntry = useStore((state) => state.moveEntry)
  const removeEntry = useStore((state) => state.removeEntry)
  const renameSetlist = useStore((state) => state.renameSetlist)
  const deleteSetlist = useStore((state) => state.deleteSetlist)
  const navigate = useStore((state) => state.navigate)

  const [picking, setPicking] = useState(false)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const songById = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs])

  if (!setlist) {
    return (
      <div className="screen">
        <header className="topbar">
          <button className="icon-btn" onClick={onBack} aria-label="Back">
            <Icon name="back" />
          </button>
          <div className="brand">
            <h1>Set not found</h1>
          </div>
        </header>
      </div>
    )
  }

  const firstEntry = setlist.entries[0]

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <div className="brand" role="button" tabIndex={0} onClick={() => { setName(setlist.name); setRenaming(true) }}>
          <div>
            <h1>{setlist.name}</h1>
            <p>{setlist.entries.length} songs · tap to rename</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button" onClick={() => setPicking(true)}>
            <Icon name="plus" size={18} />
            Add songs
          </button>
          <button
            className="primary-button"
            disabled={!firstEntry}
            onClick={() => firstEntry && onOpenEntry(firstEntry.id)}
          >
            <Icon name="play" size={18} />
            Start
          </button>
          <button className="icon-btn" onClick={() => setConfirmDelete(true)} aria-label="Delete set list">
            <Icon name="trash" />
          </button>
        </div>
      </header>

      {setlist.entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-mark">
            <Icon name="list" size={32} />
          </div>
          <h2>This set is empty</h2>
          <p>Add songs, then drag them into the right order. Each entry can carry its own key, capo and stage note.</p>
          <button className="primary-button" onClick={() => setPicking(true)}>
            <Icon name="plus" size={18} />
            Add songs
          </button>
        </div>
      ) : (
        <div className="setlist-detail">
          {setlist.entries.map((entry, index) => {
            const song = songById.get(entry.songId)
            if (!song) {
              return (
                <div className="set-row missing" key={entry.id}>
                  <span className="set-index">{index + 1}</span>
                  <span className="set-main">Missing song</span>
                  <button className="icon-btn" onClick={() => void removeEntry(setlist.id, entry.id)}>
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              )
            }
            const key = entry.key ?? song.key
            return (
              <div
                className="set-row"
                key={entry.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenEntry(entry.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onOpenEntry(entry.id)
                }}
              >
                <span className="set-index">{index + 1}</span>
                <span className="set-main">
                  <strong>{song.title}</strong>
                  <em>{song.artist || 'Unknown artist'}</em>
                  {entry.notes ? <span className="set-note">{entry.notes}</span> : null}
                </span>
                <span className="set-chips">
                  {key ? <span className="chip strong">{key}</span> : null}
                  {(entry.capo ?? song.capo) ? (
                    <span className="chip">capo {entry.capo ?? song.capo}</span>
                  ) : null}
                </span>
                <span className="set-actions">
                  <button
                    className="icon-btn"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={(event) => {
                      event.stopPropagation()
                      void moveEntry(setlist.id, entry.id, -1)
                    }}
                  >
                    <Icon name="up" size={18} />
                  </button>
                  <button
                    className="icon-btn"
                    aria-label="Move down"
                    disabled={index === setlist.entries.length - 1}
                    onClick={(event) => {
                      event.stopPropagation()
                      void moveEntry(setlist.id, entry.id, 1)
                    }}
                  >
                    <Icon name="down" size={18} />
                  </button>
                  <button
                    className="icon-btn"
                    aria-label="Edit entry"
                    onClick={(event) => {
                      event.stopPropagation()
                      setEditingEntryId(entry.id)
                    }}
                  >
                    <Icon name="sliders" size={18} />
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {setlist.entries.length > 0 && (
        <footer className="set-footer">
          <span>{setlist.entries.length} songs ready</span>
          <button className="primary-button" disabled={!firstEntry} onClick={() => firstEntry && onOpenEntry(firstEntry.id)}>
            <Icon name="play" size={18} />
            Start set
          </button>
        </footer>
      )}

      <SongPicker
        open={picking}
        onClose={() => setPicking(false)}
        title={`Add to ${setlist.name}`}
        onPick={(songId) => void addToSetlist(setlist.id, songId)}
      />

      {editingEntryId && (
        <EntryEditor setlistId={setlist.id} entryId={editingEntryId} onClose={() => setEditingEntryId(null)} />
      )}

      <Modal
        open={renaming}
        title="Rename set list"
        onClose={() => setRenaming(false)}
        footer={
          <button
            className="primary-button"
            onClick={() => {
              void renameSetlist(setlist.id, name)
              setRenaming(false)
            }}
          >
            Save
          </button>
        }
      >
        <label className="field wide">
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </label>
      </Modal>

      <Modal
        open={confirmDelete}
        title="Delete set list?"
        onClose={() => setConfirmDelete(false)}
        footer={
          <div className="modal-actions">
            <button className="ghost-button" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button
              className="danger-button"
              onClick={() => {
                void deleteSetlist(setlist.id)
                setConfirmDelete(false)
                navigate({ name: 'setlists' })
              }}
            >
              Delete
            </button>
          </div>
        }
      >
        <p className="muted">The songs stay in your library — only this set and its key/capo overrides are removed.</p>
      </Modal>
    </div>
  )
}

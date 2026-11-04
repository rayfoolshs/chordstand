import { useState } from 'react'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { Modal } from './Modal'

export function Setlists({ onBack, onOpen }: { onBack: () => void; onOpen: (setlistId: string) => void }) {
  const setlists = useStore((state) => state.setlists)
  const songs = useStore((state) => state.songs)
  const createSetlist = useStore((state) => state.createSetlist)

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const create = async () => {
    const setlist = await createSetlist(name || 'New set')
    setCreating(false)
    setName('')
    onOpen(setlist.id)
  }

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <div className="brand">
          <div>
            <h1>Set lists</h1>
            <p>{setlists.length} saved</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="primary-button" onClick={() => setCreating(true)}>
            <Icon name="plus" size={18} />
            New set
          </button>
        </div>
      </header>

      {setlists.length === 0 ? (
        <div className="empty-state">
          <div className="empty-mark">
            <Icon name="list" size={32} />
          </div>
          <h2>Build your first set</h2>
          <p>Group songs for a gig, rehearse in order, and pin a different key or capo per song without changing the chart.</p>
          <button className="primary-button" onClick={() => setCreating(true)}>
            <Icon name="plus" size={18} />
            New set list
          </button>
        </div>
      ) : (
        <div className="setlist-grid">
          {setlists.map((setlist) => {
            const titles = setlist.entries
              .map((entry) => songs.find((song) => song.id === entry.songId)?.title)
              .filter(Boolean)
            return (
              <button className="setlist-card" key={setlist.id} onClick={() => onOpen(setlist.id)}>
                <div className="setlist-card-head">
                  <h2>{setlist.name}</h2>
                  <span className="chip">{setlist.entries.length} songs</span>
                </div>
                <p>{titles.slice(0, 3).join(' · ') || 'No songs yet'}</p>
                <span className="setlist-card-foot">
                  Open set <Icon name="chevronRight" size={16} />
                </span>
              </button>
            )
          })}
        </div>
      )}

      <Modal
        open={creating}
        title="New set list"
        onClose={() => setCreating(false)}
        footer={
          <button className="primary-button" onClick={() => void create()}>
            Create
          </button>
        }
      >
        <label className="field wide">
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Sunday service, Friday at The Pub…"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter') void create()
            }}
          />
        </label>
      </Modal>
    </div>
  )
}

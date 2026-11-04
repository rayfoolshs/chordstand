import { useEffect, useLayoutEffect, useState } from 'react'
import { ImportView } from './components/ImportView'
import { Library } from './components/Library'
import { SetlistDetail } from './components/SetlistDetail'
import { Setlists } from './components/Setlists'
import { SongView } from './components/SongView'
import { EntryEditor } from './components/EntryEditor'
import { useSettings } from './store/useSettings'
import { applyAppearance } from './store/theme'
import { useStore } from './store/useStore'
import { Icon } from './components/Icon'

export default function App() {
  const loaded = useStore((state) => state.loaded)
  const songs = useStore((state) => state.songs)
  const setlists = useStore((state) => state.setlists)
  const view = useStore((state) => state.view)
  const error = useStore((state) => state.error)
  const setError = useStore((state) => state.setError)
  const load = useStore((state) => state.load)
  const navigate = useStore((state) => state.navigate)
  const appearance = useSettings((state) => state.appearance)

  const [editor, setEditor] = useState<{ setlistId: string; entryId: string } | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  useLayoutEffect(() => {
    applyAppearance(appearance)
  }, [appearance])

  if (!loaded) {
    return (
      <div className="splash">
        <span className="brand-mark large" aria-hidden="true">
          <Icon name="music" size={30} />
        </span>
        <h1>Chordstand</h1>
        <p>Opening your library…</p>
      </div>
    )
  }

  let content: React.ReactNode

  switch (view.name) {
    case 'library':
      content = (
        <Library
          onOpenSong={(songId) => navigate({ name: 'song', songId })}
          onImport={() => navigate({ name: 'import' })}
          onSetlists={() => navigate({ name: 'setlists' })}
        />
      )
      break

    case 'import':
      content = <ImportView onBack={() => navigate({ name: 'library' })} onDone={() => navigate({ name: 'library' })} />
      break

    case 'setlists':
      content = (
        <Setlists
          onBack={() => navigate({ name: 'library' })}
          onOpen={(setlistId) => navigate({ name: 'setlist', setlistId })}
        />
      )
      break

    case 'setlist':
      content = (
        <SetlistDetail
          setlistId={view.setlistId}
          onBack={() => navigate({ name: 'setlists' })}
          onOpenEntry={(entryId) => {
            const setlist = setlists.find((item) => item.id === view.setlistId)
            const entry = setlist?.entries.find((item) => item.id === entryId)
            if (setlist && entry) {
              navigate({ name: 'song', songId: entry.songId, setlistId: setlist.id, entryId })
            }
          }}
        />
      )
      break

    case 'song': {
      const song = songs.find((item) => item.id === view.songId)
      if (!song) {
        content = (
          <div className="screen">
            <header className="topbar">
              <button className="icon-btn" onClick={() => navigate({ name: 'library' })} aria-label="Back">
                <Icon name="back" />
              </button>
              <div className="brand">
                <h1>Song unavailable</h1>
              </div>
            </header>
            <div className="empty-state">
              <p>This chart may have been deleted.</p>
              <button className="ghost-button" onClick={() => navigate({ name: 'library' })}>
                Back to library
              </button>
            </div>
          </div>
        )
        break
      }

      const setlist = view.setlistId ? setlists.find((item) => item.id === view.setlistId) : undefined
      const entryIndex = setlist && view.entryId ? setlist.entries.findIndex((item) => item.id === view.entryId) : -1
      const entry = entryIndex >= 0 ? setlist?.entries[entryIndex] : undefined

      content = (
        <SongView
          key={entry?.id ?? song.id}
          song={song}
          setlist={setlist}
          entry={entry}
          entryIndex={entryIndex >= 0 ? entryIndex : undefined}
          onBack={() =>
            setlist ? navigate({ name: 'setlist', setlistId: setlist.id }) : navigate({ name: 'library' })
          }
          onOpenEntry={(entryId) => {
            const target = setlist?.entries.find((item) => item.id === entryId)
            if (setlist && target) {
              navigate({ name: 'song', songId: target.songId, setlistId: setlist.id, entryId })
            }
          }}
          onOpenEditor={(target) => {
            if (setlist) setEditor({ setlistId: setlist.id, entryId: target.id })
          }}
        />
      )
      break
    }
  }

  return (
    <div className="app">
      {content}
      {editor && (
        <EntryEditor setlistId={editor.setlistId} entryId={editor.entryId} onClose={() => setEditor(null)} />
      )}
      {error && (
        <div className="toast" role="status">
          <span>{error}</span>
          <button className="icon-btn" onClick={() => setError(null)} aria-label="Dismiss">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

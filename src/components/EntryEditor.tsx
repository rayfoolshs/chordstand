import { useState } from 'react'
import type { SetlistEntry } from '../core/types'
import { keyOptions, parseKey } from '../core/chords'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { Modal } from './Modal'

export function EntryEditor({
  setlistId,
  entryId,
  onClose,
}: {
  setlistId: string
  entryId: string
  onClose: () => void
}) {
  const setlist = useStore((state) => state.setlists.find((item) => item.id === setlistId))
  const songs = useStore((state) => state.songs)
  const updateEntry = useStore((state) => state.updateEntry)
  const removeEntry = useStore((state) => state.removeEntry)

  const entry: SetlistEntry | undefined = setlist?.entries.find((item) => item.id === entryId)
  const song = songs.find((item) => item.id === entry?.songId)

  const [notes, setNotes] = useState(entry?.notes ?? '')

  if (!entry || !setlist) return null

  const minor = parseKey(song?.key)?.minor ?? false
  const options = keyOptions(minor)
  const currentKey = entry.key ?? song?.key ?? ''
  if (currentKey && !options.some((option) => option.value === currentKey)) {
    options.unshift({ value: currentKey, label: currentKey })
  }

  return (
    <Modal open title={song?.title ?? 'Set entry'} onClose={onClose}>
      <div className="stack">
        <p className="muted">
          Changes here only affect <strong>{setlist.name}</strong>. The song itself keeps its original key.
        </p>

        <label className="field wide">
          <span>Play in key</span>
          <select
            value={currentKey}
            onChange={(event) => {
              void updateEntry(setlistId, entryId, { key: event.target.value })
            }}
          >
            <option value="">Chart default ({song?.key ?? 'none'})</option>
            {options.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="field wide">
          <span>Capo</span>
          <div className="stepper-inner wide">
            <button
              onClick={() => void updateEntry(setlistId, entryId, { capo: Math.max(0, (entry.capo ?? song?.capo ?? 0) - 1) })}
              aria-label="Capo down"
            >
              −
            </button>
            <strong>{entry.capo ?? song?.capo ?? 0}</strong>
            <button
              onClick={() =>
                void updateEntry(setlistId, entryId, {
                  capo: Math.min(11, (entry.capo ?? song?.capo ?? 0) + 1),
                })
              }
              aria-label="Capo up"
            >
              +
            </button>
          </div>
        </div>

        <label className="field wide">
          <span>Stage note</span>
          <textarea
            rows={3}
            value={notes}
            placeholder="e.g. start quiet, tag the chorus twice"
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => void updateEntry(setlistId, entryId, { notes })}
          />
        </label>

        <button
          className="sheet-row danger"
          onClick={() => {
            void removeEntry(setlistId, entryId)
            onClose()
          }}
        >
          <Icon name="trash" size={18} />
          Remove from set
        </button>

        <button className="primary-button" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  )
}

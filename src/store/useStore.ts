import { create } from 'zustand'
import type { Setlist, SetlistEntry, Song } from '../core/types'
import { db, uid } from './db'

export type View =
  | { name: 'library' }
  | { name: 'song'; songId: string; setlistId?: string; entryId?: string }
  | { name: 'setlists' }
  | { name: 'setlist'; setlistId: string }
  | { name: 'import' }

interface AppState {
  songs: Song[]
  setlists: Setlist[]
  loaded: boolean
  view: View
  error: string | null
  load: () => Promise<void>
  navigate: (view: View) => void
  addSongs: (songs: Song[]) => Promise<void>
  restoreBackup: (songs: Song[], setlists: Setlist[]) => Promise<void>
  updateSong: (id: string, patch: Partial<Song>) => Promise<void>
  deleteSongs: (ids: string[]) => Promise<void>
  touchSong: (id: string) => Promise<void>
  createSetlist: (name: string) => Promise<Setlist>
  renameSetlist: (id: string, name: string) => Promise<void>
  deleteSetlist: (id: string) => Promise<void>
  addToSetlist: (setlistId: string, songId: string) => Promise<void>
  importSetlists: (
    defs: Array<{ name: string; songs: Array<{ title: string; artist: string }> }>,
  ) => Promise<number>
  removeEntry: (setlistId: string, entryId: string) => Promise<void>
  moveEntry: (setlistId: string, entryId: string, direction: -1 | 1) => Promise<void>
  updateEntry: (setlistId: string, entryId: string, patch: Partial<SetlistEntry>) => Promise<void>
  setError: (message: string | null) => void
}

function sortSongs(songs: Song[]): Song[] {
  return [...songs].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
}

function sortSetlists(setlists: Setlist[]): Setlist[] {
  return [...setlists].sort((a, b) => b.updatedAt - a.updatedAt)
}

export const useStore = create<AppState>((set, get) => ({
  songs: [],
  setlists: [],
  loaded: false,
  view: { name: 'library' },
  error: null,

  load: async () => {
    try {
      const [songs, setlists] = await Promise.all([db.songs.toArray(), db.setlists.toArray()])
      set({ songs: sortSongs(songs), setlists: sortSetlists(setlists), loaded: true })
      if (songs.length) {
        navigator.storage?.persist?.().catch(() => undefined)
      }
    } catch (error) {
      set({ loaded: true, error: error instanceof Error ? error.message : 'Could not open the library' })
    }
  },

  navigate: (view) => set({ view }),

  addSongs: async (songs) => {
    if (!songs.length) return
    await db.songs.bulkPut(songs)
    set({ songs: sortSongs([...get().songs, ...songs]) })
  },

  restoreBackup: async (songs, setlists) => {
    await db.transaction('rw', db.songs, db.setlists, async () => {
      await db.songs.bulkPut(songs)
      await db.setlists.bulkPut(setlists)
    })
    const [allSongs, allSetlists] = await Promise.all([db.songs.toArray(), db.setlists.toArray()])
    set({ songs: sortSongs(allSongs), setlists: sortSetlists(allSetlists) })
  },

  updateSong: async (id, patch) => {
    const existing = get().songs.find((song) => song.id === id)
    if (!existing) return
    const updated: Song = { ...existing, ...patch, updatedAt: Date.now() }
    await db.songs.put(updated)
    set({ songs: sortSongs(get().songs.map((song) => (song.id === id ? updated : song))) })
  },

  deleteSongs: async (ids) => {
    if (!ids.length) return
    await db.songs.bulkDelete(ids)
    const idSet = new Set(ids)
    const setlists = get().setlists.map((setlist) => ({
      ...setlist,
      entries: setlist.entries.filter((entry) => !idSet.has(entry.songId)),
    }))
    await db.setlists.bulkPut(setlists)
    set({
      songs: get().songs.filter((song) => !idSet.has(song.id)),
      setlists: sortSetlists(setlists),
    })
  },

  touchSong: async (id) => {
    const existing = get().songs.find((song) => song.id === id)
    if (!existing) return
    const updated = { ...existing, lastOpenedAt: Date.now() }
    await db.songs.put(updated)
    set({ songs: get().songs.map((song) => (song.id === id ? updated : song)) })
  },

  createSetlist: async (name) => {
    const now = Date.now()
    const setlist: Setlist = {
      id: uid('set-'),
      name: name.trim() || 'New set',
      entries: [],
      createdAt: now,
      updatedAt: now,
    }
    await db.setlists.put(setlist)
    set({ setlists: sortSetlists([...get().setlists, setlist]) })
    return setlist
  },

  renameSetlist: async (id, name) => {
    const setlist = get().setlists.find((item) => item.id === id)
    if (!setlist) return
    const updated = { ...setlist, name: name.trim() || setlist.name, updatedAt: Date.now() }
    await db.setlists.put(updated)
    set({ setlists: sortSetlists(get().setlists.map((item) => (item.id === id ? updated : item))) })
  },

  deleteSetlist: async (id) => {
    await db.setlists.delete(id)
    set({ setlists: get().setlists.filter((setlist) => setlist.id !== id) })
  },

  addToSetlist: async (setlistId, songId) => {
    const setlist = get().setlists.find((item) => item.id === setlistId)
    if (!setlist) return
    const entry: SetlistEntry = { id: uid('entry-'), songId }
    const updated = { ...setlist, entries: [...setlist.entries, entry], updatedAt: Date.now() }
    await db.setlists.put(updated)
    set({ setlists: sortSetlists(get().setlists.map((item) => (item.id === setlistId ? updated : item))) })
  },

  importSetlists: async (defs) => {
    const songs = get().songs
    const normalise = (value: string) => value.trim().toLowerCase()
    const now = Date.now()
    const created: Setlist[] = []

    defs.forEach((def, index) => {
      const entries: SetlistEntry[] = []
      def.songs.forEach((item) => {
        const title = normalise(item.title)
        const artist = normalise(item.artist)
        const song =
          songs.find(
            (candidate) =>
              normalise(candidate.title) === title &&
              (!artist || normalise(candidate.artist) === artist),
          ) ?? songs.find((candidate) => normalise(candidate.title) === title)
        if (song) entries.push({ id: uid('entry-'), songId: song.id })
      })

      if (!entries.length) return
      created.push({
        id: uid('set-'),
        name: def.name.trim() || `Imported set ${index + 1}`,
        entries,
        createdAt: now + created.length,
        updatedAt: now,
      })
    })

    if (!created.length) return 0
    await db.setlists.bulkPut(created)
    set({ setlists: sortSetlists([...get().setlists, ...created]) })
    return created.length
  },

  removeEntry: async (setlistId, entryId) => {
    const setlist = get().setlists.find((item) => item.id === setlistId)
    if (!setlist) return
    const updated = {
      ...setlist,
      entries: setlist.entries.filter((entry) => entry.id !== entryId),
      updatedAt: Date.now(),
    }
    await db.setlists.put(updated)
    set({ setlists: sortSetlists(get().setlists.map((item) => (item.id === setlistId ? updated : item))) })
  },

  moveEntry: async (setlistId, entryId, direction) => {
    const setlist = get().setlists.find((item) => item.id === setlistId)
    if (!setlist) return
    const entries = [...setlist.entries]
    const index = entries.findIndex((entry) => entry.id === entryId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= entries.length) return
    ;[entries[index], entries[target]] = [entries[target], entries[index]]
    const updated = { ...setlist, entries, updatedAt: Date.now() }
    await db.setlists.put(updated)
    set({ setlists: sortSetlists(get().setlists.map((item) => (item.id === setlistId ? updated : item))) })
  },

  updateEntry: async (setlistId, entryId, patch) => {
    const setlist = get().setlists.find((item) => item.id === setlistId)
    if (!setlist) return
    const updated = {
      ...setlist,
      entries: setlist.entries.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)),
      updatedAt: Date.now(),
    }
    await db.setlists.put(updated)
    set({ setlists: sortSetlists(get().setlists.map((item) => (item.id === setlistId ? updated : item))) })
  },

  setError: (message) => set({ error: message }),
}))

import type { Setlist, Song } from '../core/types'
import { db } from '../store/db'
import { useStore, type View } from '../store/useStore'
import type { SyncSession } from './SyncSession'
import { PROTOCOL_VERSION, type SyncMessage } from './protocol'

let session: SyncSession | null = null
let unsubscribe: (() => void) | null = null
let applyingRemote = false
let lastSongs = new Map<string, Song>()
let lastSetlists = new Map<string, Setlist>()

const sortSongs = (songs: Song[]): Song[] =>
  [...songs].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))

const sortSetlists = (setlists: Setlist[]): Setlist[] =>
  [...setlists].sort((a, b) => b.updatedAt - a.updatedAt)

export function startMirroring(activeSession: SyncSession, host: boolean): void {
  stopMirroring()
  session = activeSession

  const state = useStore.getState()
  lastSongs = new Map(state.songs.map((song) => [song.id, song]))
  lastSetlists = new Map(state.setlists.map((setlist) => [setlist.id, setlist]))

  activeSession.onMessage = handleMessage
  unsubscribe = useStore.subscribe((next, previous) => {
    if (!session || applyingRemote) return
    if (next.songs !== previous.songs) syncSongs(next.songs)
    if (next.setlists !== previous.setlists) syncSetlists(next.setlists)
    if (next.view !== previous.view) session.send({ t: 'view', view: next.view })
  })

  activeSession.send({ t: 'hello', protocol: PROTOCOL_VERSION })
  activeSession.send({ t: 'snapshot', songs: state.songs, setlists: state.setlists })
  if (host) activeSession.send({ t: 'view', view: state.view })
}

export function stopMirroring(): void {
  unsubscribe?.()
  unsubscribe = null
  session = null
  lastSongs.clear()
  lastSetlists.clear()
  applyingRemote = false
}

function syncSongs(songs: Song[]): void {
  const current = new Map(songs.map((song) => [song.id, song]))

  current.forEach((song, id) => {
    const before = lastSongs.get(id)
    if (!before || song.updatedAt > before.updatedAt) {
      session?.send({ t: 'song', song })
    }
  })

  lastSongs.forEach((_song, id) => {
    if (!current.has(id)) session?.send({ t: 'song-del', id })
  })

  lastSongs = current
}

function syncSetlists(setlists: Setlist[]): void {
  const current = new Map(setlists.map((setlist) => [setlist.id, setlist]))

  current.forEach((setlist, id) => {
    const before = lastSetlists.get(id)
    if (!before || setlist.updatedAt > before.updatedAt) {
      session?.send({ t: 'setlist', setlist })
    }
  })

  lastSetlists.forEach((_setlist, id) => {
    if (!current.has(id)) session?.send({ t: 'setlist-del', id })
  })

  lastSetlists = current
}

function handleMessage(message: SyncMessage): void {
  switch (message.t) {
    case 'snapshot':
      mergeSnapshot(message.songs, message.setlists)
      break
    case 'song':
      applySong(message.song)
      break
    case 'song-del':
      applySongDelete(message.id)
      break
    case 'setlist':
      applySetlist(message.setlist)
      break
    case 'setlist-del':
      applySetlistDelete(message.id)
      break
    case 'view':
      applyView(message.view)
      break
    case 'hello':
      break
  }
}

function mergeSnapshot(remoteSongs: Song[], remoteSetlists: Setlist[]): void {
  const state = useStore.getState()
  const songs = mergeById(state.songs, remoteSongs)
  const setlists = mergeById(state.setlists, remoteSetlists)
  applyLibrary(songs, setlists)
}

function mergeById<T extends { id: string; updatedAt: number }>(local: T[], remote: T[]): T[] {
  const merged = new Map(local.map((item) => [item.id, item]))
  remote.forEach((item) => {
    const existing = merged.get(item.id)
    if (!existing || item.updatedAt > existing.updatedAt) merged.set(item.id, item)
  })
  return [...merged.values()]
}

function applyLibrary(songs: Song[], setlists: Setlist[]): void {
  applyingRemote = true
  try {
    useStore.setState({ songs: sortSongs(songs), setlists: sortSetlists(setlists) })
  } finally {
    applyingRemote = false
  }
  lastSongs = new Map(songs.map((song) => [song.id, song]))
  lastSetlists = new Map(setlists.map((setlist) => [setlist.id, setlist]))
  void db.songs.bulkPut(songs)
  void db.setlists.bulkPut(setlists)
}

function applySong(song: Song): void {
  const state = useStore.getState()
  const existing = state.songs.find((item) => item.id === song.id)
  if (existing && existing.updatedAt > song.updatedAt) return

  applyingRemote = true
  try {
    useStore.setState({ songs: sortSongs([...state.songs.filter((item) => item.id !== song.id), song]) })
  } finally {
    applyingRemote = false
  }
  lastSongs.set(song.id, song)
  void db.songs.put(song)
}

function applySongDelete(id: string): void {
  const state = useStore.getState()
  const songs = state.songs.filter((song) => song.id !== id)
  const setlists = sortSetlists(
    state.setlists.map((setlist) => ({
      ...setlist,
      entries: setlist.entries.filter((entry) => entry.songId !== id),
    })),
  )

  applyingRemote = true
  try {
    useStore.setState({ songs, setlists })
    if (state.view.name === 'song' && state.view.songId === id) {
      useStore.getState().navigate({ name: 'library' })
    }
  } finally {
    applyingRemote = false
  }
  lastSongs.delete(id)
  lastSetlists = new Map(setlists.map((setlist) => [setlist.id, setlist]))
  void db.songs.delete(id)
  void db.setlists.bulkPut(setlists)
}

function applySetlist(setlist: Setlist): void {
  const state = useStore.getState()
  const existing = state.setlists.find((item) => item.id === setlist.id)
  if (existing && existing.updatedAt > setlist.updatedAt) return

  applyingRemote = true
  try {
    useStore.setState({
      setlists: sortSetlists([...state.setlists.filter((item) => item.id !== setlist.id), setlist]),
    })
  } finally {
    applyingRemote = false
  }
  lastSetlists.set(setlist.id, setlist)
  void db.setlists.put(setlist)
}

function applySetlistDelete(id: string): void {
  const state = useStore.getState()
  applyingRemote = true
  try {
    useStore.setState({ setlists: state.setlists.filter((setlist) => setlist.id !== id) })
    if (state.view.name === 'setlist' && state.view.setlistId === id) {
      useStore.getState().navigate({ name: 'setlists' })
    }
  } finally {
    applyingRemote = false
  }
  lastSetlists.delete(id)
  void db.setlists.delete(id)
}

function applyView(view: View): void {
  if (!view || view.name === 'import') return
  // A song or set can arrive moments after the view message.
  if (view.name === 'song' && !useStore.getState().songs.some((song) => song.id === view.songId)) return
  if (view.name === 'setlist' && !useStore.getState().setlists.some((setlist) => setlist.id === view.setlistId)) {
    return
  }

  applyingRemote = true
  try {
    useStore.getState().navigate(view)
  } finally {
    applyingRemote = false
  }
}

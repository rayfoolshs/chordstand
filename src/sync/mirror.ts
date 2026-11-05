import type { Setlist, Song } from '../core/types'
import { db } from '../store/db'
import { useStore, type View } from '../store/useStore'
import { PROTOCOL_VERSION, type SyncMessage } from './protocol'

/** Anything that can carry sync messages to one other device. */
export interface MirrorLink {
  send: (message: SyncMessage) => void
  onMessage?: (message: SyncMessage) => void
}

const SCROLL_THROTTLE_MS = 60

interface Peer {
  session: MirrorLink
}

let peers: Peer[] = []
let isHost = false
let unsubscribe: (() => void) | null = null
let applyingRemote = false
let lastSongs = new Map<string, Song>()
let lastSetlists = new Map<string, Setlist>()
let remoteScrollHandler: ((songId: string, progress: number) => void) | null = null
let remoteAutoscrollHandler: ((songId: string, active: boolean, speed: number) => void) | null = null
let remoteTransposeHandler: ((songId: string, key: string, capo: number) => void) | null = null
let remoteFullscreenHandler: ((active: boolean) => void) | null = null
let activeTranspose: { songId: string; key: string; capo: number } | null = null
let incomingTranspose: { songId: string; key: string; capo: number } | null = null
let lastRemoteViewAt = 0
let lastScrollSentAt = 0
let pendingScroll: { songId: string; progress: number } | null = null
let scrollTimer: ReturnType<typeof setTimeout> | null = null

const sortSongs = (songs: Song[]): Song[] =>
  [...songs].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))

const sortSetlists = (setlists: Setlist[]): Setlist[] =>
  [...setlists].sort((a, b) => b.updatedAt - a.updatedAt)

/**
 * Start mirroring with the first peer. Call addPeer() for every further peer;
 * on the host that builds a star, with the host relaying edits between guests.
 */
export function startMirroring(activeSession: MirrorLink, host: boolean): void {
  stopMirroring()
  isHost = host

  const state = useStore.getState()
  lastSongs = new Map(state.songs.map((song) => [song.id, song]))
  lastSetlists = new Map(state.setlists.map((setlist) => [setlist.id, setlist]))

  unsubscribe = useStore.subscribe((next, previous) => {
    if (!peers.length || applyingRemote) return
    if (next.songs !== previous.songs) syncSongs(next.songs)
    if (next.setlists !== previous.setlists) syncSetlists(next.setlists)
    if (next.view !== previous.view) broadcast({ t: 'view', view: next.view })
  })

  addPeer(activeSession, host)
}

/** Register another connected peer and send it the current state. */
export function addPeer(activeSession: MirrorLink, host: boolean = isHost): void {
  const peer: Peer = { session: activeSession }
  peers = peers.filter((existing) => existing.session !== activeSession)
  peers.push(peer)
  activeSession.onMessage = (message) => handleMessage(peer, message)

  const state = useStore.getState()
  activeSession.send({ t: 'hello', protocol: PROTOCOL_VERSION })
  activeSession.send({ t: 'snapshot', songs: state.songs, setlists: state.setlists })
  if (host) activeSession.send({ t: 'view', view: state.view })
  if (host && activeTranspose && state.view.name === 'song' && state.view.songId === activeTranspose.songId) {
    activeSession.send({ t: 'transpose', ...activeTranspose })
  }
}

export function removePeer(activeSession: MirrorLink): void {
  peers = peers.filter((peer) => peer.session !== activeSession)
}

export function stopMirroring(): void {
  unsubscribe?.()
  unsubscribe = null
  peers = []
  isHost = false
  lastSongs.clear()
  lastSetlists.clear()
  applyingRemote = false
  if (scrollTimer !== null) {
    clearTimeout(scrollTimer)
    scrollTimer = null
  }
  pendingScroll = null
  lastScrollSentAt = 0
  activeTranspose = null
  incomingTranspose = null
  lastRemoteViewAt = 0
}

/**
 * Register the callback that applies a peer's scroll position. The song view
 * owns the scroll element, so it installs the handler while a chart is on screen.
 * Deliberately not cleared by stopMirroring: a reconnect keeps the mounted view.
 */
export function setRemoteScrollHandler(
  handler: ((songId: string, progress: number) => void) | null,
): void {
  remoteScrollHandler = handler
}

/**
 * Broadcast the local scroll position as a fraction of the scrollable distance,
 * so devices with different screen or font sizes land on the same spot. Throttled
 * with a trailing send so the final resting position always arrives.
 */
export function sendScroll(songId: string, progress: number): void {
  if (!peers.length || applyingRemote) return
  const now = Date.now()
  if (now - lastScrollSentAt >= SCROLL_THROTTLE_MS) {
    lastScrollSentAt = now
    broadcast({ t: 'scroll', songId, progress })
    return
  }
  pendingScroll = { songId, progress }
  if (scrollTimer === null) {
    scrollTimer = setTimeout(() => {
      scrollTimer = null
      const payload = pendingScroll
      pendingScroll = null
      if (payload && peers.length && !applyingRemote) broadcast({ t: 'scroll', ...payload })
    }, SCROLL_THROTTLE_MS)
  }
}

/**
 * Register the callback that applies a peer's autoscroll toggle. As with scroll
 * positions, the song view installs this while a chart is on screen.
 */
export function setRemoteAutoscrollHandler(
  handler: ((songId: string, active: boolean, speed: number) => void) | null,
): void {
  remoteAutoscrollHandler = handler
}

/** Broadcast a local autoscroll start/stop (and speed) so the peers keep pace. */
export function sendAutoscroll(songId: string, active: boolean, speed: number): void {
  if (!peers.length || applyingRemote) return
  broadcast({ t: 'autoscroll', songId, active, speed })
}

/**
 * Register the callback that applies a peer's key/capo. As with scroll and
 * autoscroll, the song view installs this while a chart is on screen. Any
 * transposition that arrived just before the chart mounted is replayed, so a
 * device that opens a song learns the current key even if the two messages raced.
 */
export function setRemoteTransposeHandler(
  handler: ((songId: string, key: string, capo: number) => void) | null,
): void {
  remoteTransposeHandler = handler
  if (handler && incomingTranspose) {
    handler(incomingTranspose.songId, incomingTranspose.key, incomingTranspose.capo)
  }
}

/**
 * Record the key/capo currently shown on this device, so the host can replay it
 * to a device that joins while this song is open.
 */
export function reportActiveTranspose(songId: string, key: string, capo: number): void {
  activeTranspose = { songId, key, capo }
}

/** True if a peer just opened a song here, so the mount should adopt rather than assert. */
export function wasRemoteViewRecent(): boolean {
  return Date.now() - lastRemoteViewAt < 1500
}

/** Broadcast a key/capo change so every device shows the same transposition. */
export function sendTranspose(songId: string, key: string, capo: number): void {
  activeTranspose = { songId, key, capo }
  if (!peers.length || applyingRemote) return
  broadcast({ t: 'transpose', songId, key, capo })
}

/**
 * Register the callback that applies a peer's centre-stage toggle. The song view
 * installs this while a chart is on screen.
 */
export function setRemoteFullscreenHandler(handler: ((active: boolean) => void) | null): void {
  remoteFullscreenHandler = handler
}

/** Broadcast the centre-stage toggle so every screen hides its chrome together. */
export function sendFullscreen(active: boolean): void {
  if (!peers.length || applyingRemote) return
  broadcast({ t: 'fullscreen', active })
}

function broadcast(message: SyncMessage, except?: Peer): void {
  peers.forEach((peer) => {
    if (peer !== except) peer.session.send(message)
  })
}

function syncSongs(songs: Song[]): void {
  const current = new Map(songs.map((song) => [song.id, song]))

  current.forEach((song, id) => {
    const before = lastSongs.get(id)
    if (!before || song.updatedAt > before.updatedAt) broadcast({ t: 'song', song })
  })

  lastSongs.forEach((_song, id) => {
    if (!current.has(id)) broadcast({ t: 'song-del', id })
  })

  lastSongs = current
}

function syncSetlists(setlists: Setlist[]): void {
  const current = new Map(setlists.map((setlist) => [setlist.id, setlist]))

  current.forEach((setlist, id) => {
    const before = lastSetlists.get(id)
    if (!before || setlist.updatedAt > before.updatedAt) broadcast({ t: 'setlist', setlist })
  })

  lastSetlists.forEach((_setlist, id) => {
    if (!current.has(id)) broadcast({ t: 'setlist-del', id })
  })

  lastSetlists = current
}

function handleMessage(origin: Peer, message: SyncMessage): void {
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
    case 'scroll':
      remoteScrollHandler?.(message.songId, message.progress)
      break
    case 'autoscroll':
      remoteAutoscrollHandler?.(message.songId, message.active, message.speed)
      break
    case 'transpose':
      incomingTranspose = { songId: message.songId, key: message.key, capo: message.capo }
      remoteTransposeHandler?.(message.songId, message.key, message.capo)
      break
    case 'fullscreen':
      remoteFullscreenHandler?.(message.active)
      break
    case 'hello':
      break
  }

  // The host is the hub: it relays each guest's update to the other guests.
  if (isHost && message.t !== 'hello') broadcast(message, origin)
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
  // Mark the mount that follows as peer-driven, so its song view adopts the
  // incoming transposition instead of asserting this device's saved key.
  lastRemoteViewAt = Date.now()
}

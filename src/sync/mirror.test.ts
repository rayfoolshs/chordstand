import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Setlist, Song } from '../core/types'
import type { SyncMessage } from './protocol'

vi.mock('../store/db', () => ({
  uid: (prefix = '') => `${prefix}test-id`,
  db: {
    songs: {
      put: vi.fn().mockResolvedValue(undefined),
      bulkPut: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    setlists: {
      put: vi.fn().mockResolvedValue(undefined),
      bulkPut: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

import { startMirroring, stopMirroring } from './mirror'
import { useStore } from '../store/useStore'

class FakeSession {
  sent: SyncMessage[] = []
  onMessage?: (message: SyncMessage) => void
  onOpen?: () => void
  onStatus?: () => void
  send = (message: SyncMessage) => {
    this.sent.push(message)
  }
  close = () => undefined
}

const song = (id: string, title: string, updatedAt = 1): Song => ({
  id,
  title,
  artist: 'Band',
  books: [],
  tags: [],
  custom: {},
  source: `Title: ${title}\n\n[G]Words`,
  format: 'onsong',
  createdAt: 1,
  updatedAt,
})

const setlist = (id: string, name: string, updatedAt = 1): Setlist => ({
  id,
  name,
  entries: [],
  createdAt: 1,
  updatedAt,
})

const socket = (session: FakeSession) =>
  session as unknown as Parameters<typeof startMirroring>[0]

describe('mirroring', () => {
  beforeEach(() => {
    stopMirroring()
    useStore.setState({ songs: [], setlists: [], view: { name: 'library' } })
  })

  it('sends a hello, snapshot and view when the host connects', () => {
    const session = new FakeSession()
    useStore.setState({ songs: [song('a', 'Alpha')] })

    startMirroring(socket(session), true)

    expect(session.sent.map((message) => message.t)).toEqual(['hello', 'snapshot', 'view'])
    const snapshot = session.sent.find((message) => message.t === 'snapshot')
    if (!snapshot || snapshot.t !== 'snapshot') throw new Error('snapshot was not sent')
    expect(snapshot.songs).toHaveLength(1)
  })

  it('merges a remote snapshot without dropping newer local songs', () => {
    const session = new FakeSession()
    useStore.setState({ songs: [song('a', 'Local', 20)] })
    startMirroring(socket(session), false)
    session.sent = []

    session.onMessage?.({
      t: 'snapshot',
      songs: [song('a', 'Remote old', 10), song('b', 'Remote new', 5)],
      setlists: [setlist('s1', 'Friday')],
    })

    const state = useStore.getState()
    expect(state.songs.map((item) => item.title).sort()).toEqual(['Local', 'Remote new'])
    expect(state.setlists).toHaveLength(1)
  })

  it('broadcasts local song edits and deletions', () => {
    const session = new FakeSession()
    useStore.setState({ songs: [song('a', 'Alpha', 10)] })
    startMirroring(socket(session), true)
    session.sent = []

    useStore.setState({ songs: [song('a', 'Alpha edited', 20)] })
    expect(session.sent.some((message) => message.t === 'song' && message.song.title === 'Alpha edited')).toBe(
      true,
    )

    useStore.setState({ songs: [] })
    expect(session.sent.some((message) => message.t === 'song-del' && message.id === 'a')).toBe(true)
  })

  it('broadcasts view changes only after mirroring starts', () => {
    const session = new FakeSession()
    startMirroring(socket(session), true)
    session.sent = []

    useStore.setState({ view: { name: 'setlists' } })
    expect(session.sent).toContainEqual({ t: 'view', view: { name: 'setlists' } })
  })

  it('does not broadcast remote updates back to the peer', () => {
    const session = new FakeSession()
    startMirroring(socket(session), false)
    session.sent = []

    session.onMessage?.({ t: 'song', song: song('a', 'From peer', 5) })
    expect(useStore.getState().songs.map((item) => item.title)).toContain('From peer')
    expect(session.sent).toHaveLength(0)
  })
})

import Dexie, { type Table } from 'dexie'
import type { Setlist, Song } from '../core/types'

class ChordstandDB extends Dexie {
  songs!: Table<Song, string>
  setlists!: Table<Setlist, string>

  constructor() {
    super('chordstand')
    this.version(1).stores({
      songs: 'id, title, artist, updatedAt, lastOpenedAt',
      setlists: 'id, name, updatedAt',
    })
  }
}

export const db = new ChordstandDB()

export function uid(prefix = ''): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}${random}`
}

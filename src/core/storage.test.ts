import { describe, expect, it } from 'vitest'
import { backupFileName, describeBackupAge, estimateLibraryBytes, formatBytes } from './storage'
import type { Song } from './types'

const song: Song = {
  id: 'a',
  title: 'Amazing Grace',
  artist: 'John Newton',
  books: [],
  tags: [],
  custom: {},
  source: 'Title: Amazing Grace\n\n[G]Amazing grace',
  format: 'onsong',
  createdAt: 1,
  updatedAt: 1,
}

describe('storage helpers', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('estimates library size from songs and set lists', () => {
    expect(estimateLibraryBytes([], [])).toBe(0)
    expect(
      estimateLibraryBytes(
        [song],
        [{ id: 's', name: 'Set', entries: [], createdAt: 1, updatedAt: 1 }],
      ),
    ).toBeGreaterThan(song.source.length)
  })

  it('names backups by date', () => {
    expect(backupFileName(new Date(2026, 10, 4))).toBe('chordstand-backup-2026-11-04.zip')
  })

  it('describes backup age', () => {
    const now = Date.now()
    expect(describeBackupAge(undefined, now)).toBe('No backup yet')
    expect(describeBackupAge(now - 30_000, now)).toBe('Just now')
    expect(describeBackupAge(now - 2 * 60 * 60 * 1000, now)).toBe('2 hours ago')
    expect(describeBackupAge(now - 3 * 24 * 60 * 60 * 1000, now)).toBe('3 days ago')
  })
})

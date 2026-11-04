import { beforeAll, describe, expect, it } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { resolve } from 'node:path'
import { extractSetlistsFromDatabase, extractSongsFromDatabase } from './onsongBackup'

let SQL: SqlJsStatic

beforeAll(async () => {
  SQL = await initSqlJs({ locateFile: (file) => resolve('node_modules/sql.js/dist', file) })
})

function makeDb(sql: string): Database {
  const db = new SQL.Database()
  db.run(sql)
  return db
}

describe('OnSong backup extraction', () => {
  it('reads songs and metadata from a songs table', () => {
    const db = makeDb(`
      CREATE TABLE songs (
        id INTEGER PRIMARY KEY,
        title TEXT,
        artist TEXT,
        songKey TEXT,
        capo INTEGER,
        bpm INTEGER,
        lyrics TEXT
      );
      INSERT INTO songs VALUES (1, 'Amazing Grace', 'John Newton', 'G', 2, 78,
        '[G]Amazing grace how sweet the sound');
      INSERT INTO songs VALUES (2, 'Wagon Wheel', 'Old Crow Medicine Show', 'A', 0, 152,
        '[A]Headed down south to the land of the pines');
    `)

    const songs = extractSongsFromDatabase(db)
    db.close()

    expect(songs).toHaveLength(2)
    expect(songs[0].title).toBe('Amazing Grace')
    expect(songs[0].artist).toBe('John Newton')
    expect(songs[0].source).toContain('Title: Amazing Grace')
    expect(songs[0].source).toContain('Key: G')
    expect(songs[0].source).toContain('Capo: 2')
    expect(songs[0].source).toContain('Tempo: 78')
    expect(songs[0].source).toContain('[G]Amazing grace how sweet the sound')
  })

  it('preserves a chart that already contains its own metadata', () => {
    const db = makeDb(`
      CREATE TABLE Song (id INTEGER PRIMARY KEY, name TEXT, lyrics TEXT);
      INSERT INTO Song VALUES (1, 'Fallback title',
        'Title: Real Title
Artist: Real Artist
Key: D

[D]First line
[A]Second line');
    `)

    const songs = extractSongsFromDatabase(db)
    db.close()

    expect(songs).toHaveLength(1)
    expect(songs[0].source).toContain('Title: Fallback title')
    expect(songs[0].source).toContain('Key: D')
    expect(songs[0].source).toContain('[D]First line')
    expect(songs[0].source).not.toContain('Title: Real Title')
  })

  it('reads set lists through an association table, in order', () => {
    const db = makeDb(`
      CREATE TABLE songs (id INTEGER PRIMARY KEY, title TEXT, artist TEXT, lyrics TEXT);
      INSERT INTO songs VALUES (1, 'One', 'Band', '[C]One');
      INSERT INTO songs VALUES (2, 'Two', 'Band', '[D]Two');
      CREATE TABLE sets (id INTEGER PRIMARY KEY, name TEXT);
      INSERT INTO sets VALUES (10, 'Friday Gig');
      CREATE TABLE set_songs (set_id INTEGER, song_id INTEGER, position INTEGER);
      INSERT INTO set_songs VALUES (10, 2, 1), (10, 1, 2);
    `)

    const songs = extractSongsFromDatabase(db)
    const setlists = extractSetlistsFromDatabase(db, songs)
    db.close()

    expect(setlists).toHaveLength(1)
    expect(setlists[0].name).toBe('Friday Gig')
    expect(setlists[0].songs.map((song) => song.title)).toEqual(['Two', 'One'])
  })

  it('reads set lists stored as a JSON column', () => {
    const db = makeDb(`
      CREATE TABLE songs (id INTEGER PRIMARY KEY, title TEXT, lyrics TEXT);
      INSERT INTO songs VALUES (1, 'One', '[C]One');
      INSERT INTO songs VALUES (2, 'Two', '[D]Two');
      CREATE TABLE playlists (id INTEGER PRIMARY KEY, name TEXT, items TEXT);
      INSERT INTO playlists VALUES (5, 'Sunday', '[2,1]');
    `)

    const songs = extractSongsFromDatabase(db)
    const setlists = extractSetlistsFromDatabase(db, songs)
    db.close()

    expect(setlists).toHaveLength(1)
    expect(setlists[0].name).toBe('Sunday')
    expect(setlists[0].songs.map((song) => song.title)).toEqual(['Two', 'One'])
  })

  it('ignores media and settings tables', () => {
    const db = makeDb(`
      CREATE TABLE songs (id INTEGER PRIMARY KEY, title TEXT, lyrics TEXT);
      INSERT INTO songs VALUES (1, 'One', '[C]One');
      CREATE TABLE media (id INTEGER PRIMARY KEY, title TEXT, data BLOB);
      INSERT INTO media VALUES (1, 'Backing track', x'00');
      CREATE TABLE settings (id INTEGER PRIMARY KEY, title TEXT, value TEXT);
      INSERT INTO settings VALUES (1, 'Theme', 'dark');
    `)

    const songs = extractSongsFromDatabase(db)
    db.close()

    expect(songs.map((song) => song.title)).toEqual(['One'])
  })
})

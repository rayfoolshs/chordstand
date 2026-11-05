# Chordstand — Architecture

## Runtime shape

```
                  ┌─────────────────────────────┐
                  │  Chordstand PWA (static)    │
                  │  React + Zustand + Dexie    │
                  └─────────────┬───────────────┘
                                │
              ┌─────────────────┼──────────────────┐
              │                 │                  │
        IndexedDB          localStorage       Service Worker
      songs, setlists   appearance, keys,      app shell +
                        capo, speed           hashed assets
              │
              │  short-lived signalling (PeerJS) to pair
              ▼
      PeerJS public service ── offer/answer ──┐
              │                               │
              │  direct WebRTC data channel    │
              ▼                               │
      another Chordstand device ◀─────────────┘
```

There is no application backend. The app is a static bundle and all data lives on-device. Pairing borrows the
free public PeerJS signalling service for a few seconds; once the data channel is open, mirroring is direct
between the devices and the service is no longer involved.

## Stack

| Concern | Choice |
| --- | --- |
| UI | React 19 + TypeScript |
| Build | Vite 6 |
| State | Zustand |
| Persistence | Dexie / IndexedDB |
| Files | fflate (zip), sql.js (lazy, OnSong `.backup`) |
| Pairing | PeerJS (public signalling) + `qrcode` + `jsqr` |
| Offline | Hand-written service worker + manifest |
| Tests | Vitest (Node) |

## Data model

```ts
Song {
  id, title, artist, author?, key?, transposedKey?, capo?, tempo?, time?,
  duration?, books[], number?, tags[], copyright?, ccli?, tuning?, pitch?,
  flow?, source, format, createdAt, updatedAt, lastOpenedAt?, custom{}
}

Setlist {
  id, name, date?, entries: SetlistEntry[], createdAt, updatedAt
}

SetlistEntry {
  id, songId, key?, capo?, notes?
}

View =
  | { name: 'library' }
  | { name: 'song', songId, setlistId?, entryId? }
  | { name: 'setlists' }
  | { name: 'setlist', setlistId }
  | { name: 'import' }
```

`source` is the raw chart text. It is never rewritten by rendering, so export stays lossless.

## State and storage

- `src/store/db.ts` — Dexie tables `songs` and `setlists`.
- `src/store/useStore.ts` — in-memory lists, set-list mutations, navigation.
- `src/store/useSettings.ts` — persisted settings in `localStorage` under `chordstand.settings.v1` (font, appearance, song key/capo memory, scroll speeds).
- `src/store/theme.ts` — derives CSS variables from the appearance value.

Write path: UI action → Zustand update → Dexie write. The sync engine subscribes to Zustand and compares the previous and next song/setlist arrays by `updatedAt` to decide what to broadcast.

## Import pipeline

```
File / zip / .backup / paste
        │
        ├─ text formats → parseSong()
        │     header metadata → body lines → ChartLine[]
        │
        ├─ zip → inspect entries → recurse, or detect OnSong.sqlite3
        │
        └─ .backup → unzip → sql.js → extractSongsFromDatabase()
                                 → extractSetlistsFromDatabase()
        │
        ▼
ImportCandidate[]  (preview, duplicates, warnings)
        │  user confirms
        ▼
Song[] → Dexie → Zustand
```

### Text parser

`src/core/parser.ts` recognises:

- Metadata header (name/value pairs before the first blank line) and ChordPro `{title:}` style directives.
- Title/artist shorthand (first two plain lines), with guards so chords/sections are not mistaken for titles.
- Bracketed chords (`[G]word`) and column-aligned chords over lyrics.
- Sections: `[Verse 1]`, `Verse 1`, `{start_of_chorus}`, `{comment:}`.
- Inline `{transpose: n}` offsets. Inline `{key:}` / `{capo:}` are preserved but ignored and reported.
- Key detection from the first chord when no key is given.
- Windows line endings, BOM, and UTF-8/Windows-1252 input.

### OnSong backup extraction

`src/core/onsongBackup.ts` loads `sql.js` only when a backup is opened. It:

- Finds the SQLite file inside the zip and verifies its header.
- Enumerates tables and scores them for song-likeness (title/artist/text columns, table-name hints).
- Reads the best text column per row, merges column metadata with any embedded OnSong header, and synthesises a clean `.onsong` source.
- Detects set lists via JSON columns, association tables (`set_songs`) or a `set_id` column on songs.
- Returns notes so the preview can explain what was found.

The schema is undocumented and heuristic; unrecognised layouts produce a note listing the table names.

## Chart rendering and transpose

`ChordChart` parses the source on demand (`useMemo`) and renders each `ChartLine`. Chord symbols are transposed at display time:

```
displayChord = transpose(sourceChord, inlineOffset + semitones(songKey → targetKey) - capo)
```

`src/core/chords.ts` handles roots, qualities, slash basses, key parsing, enharmonic spelling and capo shape-key calculation. The source is never mutated by a key change.

## Appearance

`applyAppearance(value)` blends `NIGHT_BG` → `DUSK_BG` → `DAY_BG` on a non-linear ramp. Text colour switches at a background-luminance threshold, and accent/danger/good colours are nudged toward black or white until they meet a contrast target. Panels, lines and muted text are derived from the background and text. CSS consumes only variables, so theme changes are a handful of style writes.

## Centre stage (full screen)

iOS Safari only exposes the Fullscreen API to video, so full screen is an app-level mode rather than a browser
one: `SongView` adds `is-stage` to `.song-screen`, CSS hides the top bar, the controls strip and the set-list
footer, and a small fixed exit button plus `Esc` restore them. Safe-area insets are preserved so nothing sits
under the notch or home indicator. A native `requestFullscreen` is still attempted on browsers that support it.

The flag lives in `SongView` state and is broadcast as `fullscreen`, so entering the mode on one iPad hides the
chrome on the others.

## Multi-device mirroring

### Pairing

1. Host claims a peer id `chordstand-v1-<code>` on the public PeerJS signalling service, where `<code>` is four random digits.
2. If that id is taken, the host retries with another code (up to five times), so the code on screen is always valid.
3. The code, a share link (`#join=1234`) and a QR of that link are shown.
4. A guest joins by typing the code, scanning the QR, or opening the link; PeerJS brokers the offer/answer automatically.
5. Any number of guests can join the same code; the host accepts each connection and relays between them.

`src/sync/PeerLink.ts` wraps PeerJS (loaded lazily, so its ~120 kB never enters the main bundle) in a small `MirrorLink` interface, which is all the merge engine needs. There is no hand-written SDP, no clipboard shuttle, and no second scan step.

4-digit codes are chosen for readability when read aloud or typed on a stage. They are namespaced to Chordstand and collide harmlessly (the host just takes another), but they are not secrets — anyone who knows the code can join while the host is hosting.

### Messages

```ts
{ t:'hello', protocol:1 }
{ t:'snapshot', songs, setlists }
{ t:'song', song }
{ t:'song-del', id }
{ t:'setlist', setlist }
{ t:'setlist-del', id }
{ t:'view', view }
{ t:'scroll', songId, progress }
{ t:'autoscroll', songId, active, speed }
{ t:'transpose', songId, key, capo }
{ t:'fullscreen', active }
```

### Merge rules

- On connect, each peer sends `hello`, a full `snapshot`, and (host only) its current `view`.
- Snapshots merge by id, keeping the entity with the newer `updatedAt`.
- Live changes are detected by diffing the Zustand arrays: newer/unknown ids are sent as upserts, missing ids as deletes.
- The host relays every guest message to the other guests (skipping the origin), so a change made on one guest reaches them all.
- Remote applies set an `applyingRemote` guard so they are not echoed back.
- The host's initial view wins; after that, `view` messages flow both ways and open the same song/set on every device.
- `scroll` carries the current song id and the position as a fraction (0–1) of the scrollable distance, so devices with different screen or font sizes land on the same spot. Sends are throttled to ~16/s with a trailing update, and the view ignores the echo of a programmatic scroll so peers do not loop.
- `autoscroll` mirrors the start/pause toggle for a song, along with the speed so devices scroll at the same rate. Each device runs its own rAF loop, so while several are autoscrolling the view only corrects drift larger than 1% of the chart instead of fighting the peer's loop; a device that was started remotely does not broadcast a stop when it reaches the end first.
- `transpose` mirrors the live key and capo chosen in the song view (the per-device stage state, not the set-list entry). The receiver applies it and persists it to its own settings so the chart stays transposed after navigating away. It is stateful: opening a chart asserts the current key/capo, a chart opened by a peer adopts the incoming value instead of asserting (so two devices do not fight), and the host replays its current transposition to a device that joins while the song is open. A late-arriving transposition is buffered and replayed when the chart mounts.
- `fullscreen` mirrors the centre-stage toggle. The mode is implemented in CSS (hide the top bar, controls and set-list footer) rather than the Fullscreen API, because iOS Safari does not expose that to non-video content; a native request is still attempted on browsers that support it.
- Set list entries carry their own key/capo/notes, so those travel with the set list.

### Limitations

- Hub-and-spoke: one host relays to the guests, so the host is a single point of failure. A small number of devices is the practical limit.
- No tombstones: a song deleted while offline can be reintroduced by the other device's snapshot.
- Conflicts are last-write-wins by `updatedAt`; there is no merge UI.
- Every app must stay open; there is no background sync.

## PWA and offline

- `public/manifest.webmanifest`, generated PNG icons and `public/sw.js`.
- `scripts/build-sw.mjs` injects the hashed Vite assets into `dist/sw.js` and derives relative asset URLs from the service worker scope, so the app works at `/` or `/chordstand/`.
- Navigation is network-first with a cached shell fallback; assets are cache-first.
- `BASE_URL` is injected into the service-worker registration for subpath deployments.
- Storage is IndexedDB; Safari evicts script-writable storage for browser tabs after inactivity, but installed home-screen PWAs are exempt. Backups are still recommended.

## File map

```
src/
  core/        types, parser, chords, import, OnSong backup, UG cleanup, demos
  store/       Dexie schema, app store, settings, theme engine
  hooks/       autoscroll, wake lock, fullscreen, pedal hotkeys
  sync/        message types, PeerJS link, mirror engine, manager/UI state
  components/  Library, SongView, Setlists, Import, editors, sync dialog
  styles/      single stylesheet driven by CSS variables
docs/          build plan, architecture, testing, decisions
scripts/       icon generation, service-worker asset injection
.github/       GitHub Pages deployment workflow
```

## Extension points

- **New import formats:** add a reader in `core/import.ts` and normalise to OnSong text or a `Song`.
- **New sync payloads:** add a message to `protocol.ts`, a handler in `mirror.ts`, and a test.
- **New themes:** adjust the palette constants and ramp in `store/theme.ts`.
- **New stage controls:** add store actions and map keys in `hooks/useStage.ts`.
- **PDF charts:** add a blob table to Dexie and a `page`-backed `Song` format while keeping the current text path intact.

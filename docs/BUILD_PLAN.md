# Chordstand — Build Plan

Last updated: 2026-11-04

## Product statement

Chordstand is a local-first chord chart, set list and stage app for working musicians. It is designed for a band that already has a large OnSong library: the first job is to bring that library across without losing chords, keys, capos or set lists, and the second is to be faster and less fiddly on stage than OnSong.

Non-goals for this phase: accounts, subscriptions, cloud hosting, social features and content licensing.

## Status at a glance

| Area | Status | Notes |
| --- | --- | --- |
| OnSong `.onsong` / ChordPro / text import | **Done** | Metadata, chords-over-lyrics, bracketed chords, sections, inline transpose, duplicate detection, preview + warnings |
| OnSong `.backup` import | **Done** | ZIP → `OnSong.sqlite3` → songs, metadata and set lists via a lazy-loaded SQLite engine. Schema discovery is heuristic because OnSong does not publish its schema |
| Library, search, books, duplicate handling | **Done** | IndexedDB persistence, title/artist/lyric/tag search |
| Chart rendering | **Done** | Sections, chord alignment, stage typography, lyrics-only mode, night/day |
| Transpose and capo | **Done** | Real chord parsing (slash/sus/add/extensions), enharmonic spelling, per-set overrides |
| Set lists | **Done** | Create, reorder, notes, per-entry key/capo, start/next/previous, "Pin to set" |
| Autoscroll / pedal / wake lock | **Done** | Duration-derived or manual speed; Space/arrow/PageUp/PageDown/F mappings |
| Offline PWA | **Done** | Installable, precached shell, verified cold load with the server off |
| Backup / restore / export | **Done** | `.onsong` zip, full backup, in-app restore |
| Appearance slider | **Done** | Continuous night → dusk → daylight with contrast-aware text/accent |
| Two-device mirroring | **Implemented, device verification pending** | WebRTC data channel + QR pairing, two-way songs/sets/view sync. The development browser exposes no ICE candidates, so only the protocol and merge logic are covered by automated tests here |
| Ultimate Guitar workflow | **Done (compliant)** | In-app search launcher + clipboard paste + UG text cleaner. No scraping |
| PDF / image charts | Not started | Next major content feature |
| Backing tracks / MIDI / projection | Not started | Later phase |
| Hosted relay for mirroring across networks | Not started | Optional, only if LAN-only is insufficient |

## Milestones

### M0 — Scaffold and data model ✅
- Vite + React 19 + TypeScript, Zustand, Dexie.
- Canonical `Song`, `Setlist`, `ChartLine`, `ChordSegment`.
- Raw source retained on every song for lossless export.

### M1 — Parser and chord engine ✅
- OnSong header metadata, title/artist shorthand, ChordPro directives.
- Two chord notations: bracketed and chords-over-lyrics.
- Transposition, capo, key detection, duration parsing.
- Golden tests for round-trip export and edge cases.

**Acceptance:** parser and transpose tests pass; a realistic OnSong file renders and exports without losing its chart body.

### M2 — Import pipeline ✅
- Files, folders inside zips, paste, `.backup`, Chordstand JSON backups.
- Preview with per-song selection, warnings, duplicates pre-unchecked.
- ZIP handling, Windows-1252 fallback, BOM handling.
- PDFs flagged as unsupported rather than failing silently.

**Acceptance:** a zip of .onsong files imports with correct metadata; duplicates are visible; PDFs are reported.

### M3 — Chart view and stage controls ✅
- Readable stage layout, section labels, chord colour, paper/night modes.
- Key/capo controls with live re-render.
- Autoscroll, speed, pause/resume, progress.
- Keyboard/pedal mappings, fullscreen, wake lock.

**Acceptance:** a full song can be performed start to finish without touching the screen except to start scroll.

### M4 — Set lists ✅
- Library of sets, drag-free reordering (up/down), entry editor.
- Per-entry key/capo/notes; "Pin to set".
- Setlist-aware navigation and "up next".

**Acceptance:** a two-song set can be created, started, advanced with a pedal, and keeps per-entry keys.

### M5 — PWA, offline and backups ✅
- Web app manifest, icons, service worker with precached assets.
- Verified offline reload with the dev server stopped.
- Export all songs, full backup, restore.

**Acceptance:** installed PWA opens with no network and shows the library.

### M6 — OnSong backup import ✅
- `.backup` detection (ZIP + SQLite header).
- Lazy `sql.js`; schema discovery for song text and set lists.
- Column-based metadata merge; HTML/RTF guards.
- Notes in the import preview describing what was found.

**Acceptance:** a synthetic backup with songs and a set list restores both, with correct order.

### M7 — Appearance slider ✅
- 0–100 appearance value with a non-linear ramp (night → dusk → light).
- Contrast-checked text and accent colours at every position.
- Quick toggles in the library header and song controls.
- Migration from the old two-state theme.

**Acceptance:** text and chords remain readable at 0/25/50/75/100; setting persists across reloads.

### M8 — Two-device mirroring 🟡
- WebRTC data channel, no server.
- SDP offer/answer compressed with zlib + base64url, exchanged by QR or text code.
- QR generation and camera scanning (`qrcode`, `jsqr`), both lazily loaded.
- Protocol: `hello`, `snapshot`, `song`, `song-del`, `setlist`, `setlist-del`, `view`.
- Snapshot merge by `updatedAt`; live change diffing; remote-apply suppression.
- Host-authoritative initial view; subsequent view changes both ways.

**Acceptance (to verify on hardware):**
- Two iPads on the same Wi-Fi pair with two QR scans (or two pasted codes).
- The libraries merge; a song added on either side appears on both.
- Editing/deleting a song or set list mirrors.
- Opening a song or set list on one device opens it on the other.
- Reconnect after closing and reopening the dialog works.
- Disconnect leaves both libraries intact.

**Why it is still yellow:** the automated Chromium in this environment emits zero ICE candidates, so the live handshake cannot be completed here. The signalling codec, dialog flow and mirror engine are tested; actual NAT/ICE behaviour needs two real devices.

### M9 — Ultimate Guitar workflow ✅
- "Find chords online" card in Import.
- Search opens Ultimate Guitar's title search in a new tab.
- "Paste from clipboard" and paste field feed the existing importer.
- UG cleaner removes page chrome while keeping chart text and Key/Capo/Tuning metadata.

**Acceptance:** paste a copied UG chord sheet → preview shows title/artist/key/chords; importing it creates a usable chart.

## Next up

1. **Verify mirroring on two iPads.** Highest-risk item. Fix any ICE/permission issues found. Add a reconnect/retry path and a visible peer status.
2. **PDF and image charts.** Render via pdf.js, store as blobs, support page turn and crop. This unlocks the rest of many users' OnSong libraries.
3. **Sync conflict UX.** Today the newest `updatedAt` wins and offline deletions can be reintroduced by a peer snapshot. Add tombstones and a "this device has newer changes" review.
4. **Library performance.** Virtualize the song list and test with 2,000+ songs.
5. **Song editor polish.** Chord picker, bar/repeat shorthand, section ordering via Flow.
6. **Band pack.** Export a set + charts for a bandmate without pairing.

## Later

- Backing tracks, click and auto-advance.
- External display / projector output.
- Optional hosted relay for cross-network mirroring.
- Licensed catalog integration (e.g. SongSelect/PraiseCharts) instead of UG scraping.
- Multi-device (>2) sessions.

## Open questions

- OnSong backup schema variants: the extractor is tolerant, but a real library may reveal new column/table names. Ask users for the table list when extraction finds nothing.
- Should mirroring synchronise key/capo overrides made live on one device? Currently a set entry's key/capo syncs because it is part of the set list; unsaved song-view key/capo changes stay local.
- Should the host or the newest edit win when both devices edit the same song offline at the same time? Current rule is newest `updatedAt`.
- Camera QR scanning requires HTTPS and camera permission. Text-code fallback is always available, but the UX for users who deny camera access needs testing.
- IndexedDB eviction on iPad: installed PWA mitigates, but backups should be encouraged after large imports.

## Definition of done for the current v1

- Library import from `.onsong`, zip, `.backup` and paste.
- Charts readable and transposable on an iPad in a dark room.
- Set lists with per-entry keys and pedal control.
- Backup and restore.
- Appearance slider.
- Two devices mirror without a server.
- No scraping of third-party content.
- Tests green: parser, transposition, import, backup extraction, pairing codec, mirror merge.

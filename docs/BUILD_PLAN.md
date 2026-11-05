# Chordstand — Build Plan

Last updated: 2026-11-05

## Product statement

Chordstand is a local-first chord chart, set list and stage app for working musicians. It is designed for a
band that already has a large OnSong library: the first job is to bring that library across without losing
chords, keys, capos or set lists, and the second is to be faster and less fiddly on stage than OnSong.

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
| Full screen (centre stage) | **Done** | Chrome-free CSS mode that works on iPad; mirrored between devices |
| Offline PWA | **Done** | Installable, precached shell, verified cold load with the server off |
| Backup / restore / export | **Done** | Storage & backups panel with size estimates, last-backup age, share-sheet save to Files, `.onsong` zip export, full backup and in-app restore |
| Appearance slider | **Done** | Continuous night → dusk → daylight with contrast-aware text/accent |
| Multi-device mirroring | **Done, verified on two iPads** | PeerJS pairing with a 4-digit code, then a direct data channel; host-relayed songs/sets/view/scroll/autoscroll/transpose/fullscreen sync |
| Ultimate Guitar workflow | **Done (compliant)** | In-app search launcher + clipboard paste, with automatic pick-up when a copied chart is detected, + UG text cleaner. No scraping |
| PDF / image charts | Not started | Next major content feature |
| Backing tracks / MIDI / projection | Not started | Later phase |
| Self-hosted signalling | Not started | Optional; only if the public PeerJS service is not good enough |
| Hosting and CI | **Done** | Public GitHub repo, GitHub Pages at <https://rayfoolshs.github.io/chordstand/>, auto-deploy + tests on every push to `main` |

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

**Acceptance:** parser and transpose tests pass; a realistic OnSong file renders and exports without losing its
chart body.

### M2 — Import pipeline ✅
- Files, folders inside zips, paste, `.backup`, Chordstand JSON backups.
- Preview with per-song selection, warnings, duplicates pre-unchecked.
- ZIP handling, Windows-1252 fallback, BOM handling.
- PDFs flagged as unsupported rather than failing silently.

**Acceptance:** a zip of `.onsong` files imports with correct metadata; duplicates are visible; PDFs are
reported.

### M3 — Chart view and stage controls ✅
- Readable stage layout, section labels, chord colour, paper/night modes.
- Key/capo controls with live re-render.
- Autoscroll, speed, pause/resume, progress.
- Keyboard/pedal mappings, full screen, wake lock.

**Acceptance:** a full song can be performed start to finish without touching the screen except to start
scroll.

### M4 — Set lists ✅
- Library of sets, up/down reordering, entry editor.
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

### M8 — Multi-device mirroring ✅
- Pairing: the host claims a 4-digit code on the public PeerJS service; guests type it, scan a QR, or open a
  share link (`#join=1234`).
- Direct WebRTC data channel after pairing; one host, many guests, host-relayed hub-and-spoke.
- Protocol: `hello`, `snapshot`, `song`, `song-del`, `setlist`, `setlist-del`, `view`, `scroll`, `autoscroll`,
  `transpose`, `fullscreen`.
- Snapshot merge by `updatedAt`; live change diffing; remote-apply suppression; stale-answer rejection.
- Stateful view, scroll, autoscroll, key/capo and full-screen sync.
- Host keeps its code open so extra iPads can join later; guests can rejoin after leaving.

**Acceptance (verified on two iPads):**
- Two iPads pair by entering a 4-digit code (or scanning the QR).
- The libraries merge; a song added on either side appears on both.
- Editing/deleting a song or set list mirrors.
- Opening a song or set list on one device opens it on the other.
- Scrolling, autoscroll, key/capo and full screen mirror.
- Reconnect after closing and reopening the dialog works.
- Disconnect leaves both libraries intact.

**What it took:** the earlier hand-written offer/answer exchange paired, but the data channel never opened on
iPadOS (ICE reported `connected`, DTLS/SCTP never did). Moving the handshake to PeerJS fixed it and collapsed
pairing to a single code. See [ADR-002](DECISIONS.md).

### M9 — Ultimate Guitar workflow ✅
- "Find chords online" card in Import.
- Search opens Ultimate Guitar's title search in a new tab.
- "Paste from clipboard" and the paste field feed the existing importer.
- UG cleaner removes page chrome while keeping chart text and Key/Capo/Tuning metadata.

**Acceptance:** paste a copied UG chord sheet → preview shows title/artist/key/chords; importing it creates a
usable chart.

### M10 — Full screen and creator credit ✅
- Full screen implemented as a CSS "centre stage" mode so it works on iPad, where the Fullscreen API is not
  available for page content.
- Chrome hides (top bar, controls, set-list footer) with a faint exit button and `Esc` to leave.
- The toggle mirrors, so one tap puts every iPad in the band into performance mode.
- Creator credit in the library header and the README.

**Acceptance:** full screen works on an installed iPad app, mirrors to the other device, and restores cleanly.

### M11 — Chart deep links ✅
- `#import=<url-encoded chart>` opens the import preview with the chart loaded and clears the hash so a reload
  does not import it twice.
- Payloads over 60,000 characters are ignored; malformed encoding is ignored rather than throwing.
- An iOS Shortcut carries a text selection from Safari's share sheet into that link; see
  [the shortcut guide](SHORTCUT.md).
- No clipboard access and still no scraping — the chart text is whatever the user selected.

**Acceptance:** sharing a selected chart through the Shortcut opens the preview, and confirming it saves the
song.

### M12 — Automatic clipboard pick-up ✅
- Copying a chart in Safari and returning to Import adds it to the preview with no tap.
- Only text that looks like a chart (bracketed chords, chord-over-lyric lines, or key/capo metadata) is
  accepted; everything else is ignored.
- The same text is never added twice, even across visits to the Import screen.
- iOS may prompt to allow pasting the first time; a refusal is silent and the Paste button still works.

**Acceptance:** copy a UG chart in Safari, switch to the installed app, and the preview is already there.

## Next up

1. **Harden mirroring.** Reconnect automatically after a Wi-Fi drop or app backgrounding, add tombstones so
   offline deletions are not resurrected, and surface a "this device has newer changes" review.
2. **PDF and image charts.** Render via pdf.js, store as blobs, support page turn and crop. This unlocks the
   rest of many users' OnSong libraries.
3. **Library performance.** Virtualize the song list and test with 2,000+ songs.
4. **Song editor polish.** Chord picker, bar/repeat shorthand, section ordering via Flow.
5. **Band pack.** Export a set plus charts for a bandmate who is not paired.
6. **Mirror font size and lyrics-only.** The remaining stage controls that still differ per device.

## Later

- Backing tracks, click and auto-advance.
- External display / projector output.
- Optional self-hosted signalling so a band can pair without the public service.
- Licensed catalog integration (e.g. SongSelect/PraiseCharts) instead of UG scraping.

## Open questions

- OnSong backup schema variants: the extractor is tolerant, but a real library may reveal new column/table
  names. Ask users for the table list when extraction finds nothing.
- Should the host or the newest edit win when both devices edit the same song offline at the same time? Current
  rule is newest `updatedAt`.
- Four-digit codes are convenient rather than secret; should the host require an approval tap before a new
  device joins, or is "on the same Wi-Fi at soundcheck" enough?
- Should the public PeerJS service stay, or should pairing move to a self-hosted signalling endpoint?
- IndexedDB eviction on iPad: installed PWA mitigates, but backups should be encouraged after large imports.

## Definition of done for the current v1

- Library import from `.onsong`, zip, `.backup` and paste.
- Charts readable and transposable on an iPad in a dark room.
- Set lists with per-entry keys and pedal control.
- Backup and restore.
- Appearance slider.
- Full screen that behaves on iPad.
- Several iPads mirror songs, sets, screen, scroll, autoscroll, key and full screen.
- No scraping of third-party content.
- Tests green: parser, transposition, import, backup extraction, mirror merge and relay.

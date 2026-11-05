# Changelog

Notable changes to Chordstand. The app is a static PWA deployed from `main`; every entry below is live at
<https://rayfoolshs.github.io/chordstand/> once its deploy run is green.

## Unreleased

### Pairing rebuilt on PeerJS
- Pairing previously exchanged hand-written WebRTC offer/answer codes by QR, copy/paste, AirDrop or a shared
  link. The exchange worked, but on iPadOS ICE reached `connected` while the data channel never opened, so
  every attempt timed out.
- The handshake now runs through PeerJS against its free public service. The host claims a **4-digit code**;
  others type it, **scan its QR**, or open a share link (`#join=1234`).
- Any number of iPads can join the same code while the host is hosting; the host relays changes between them.
- The old `SyncSession`, the `CS1` codec and their tests were removed (about 900 lines). PeerJS loads lazily,
  so it stays out of the main bundle.
- Reconnect remembers both the role **and** the code, so it is one tap.

### Full screen that works on iPad
- The Fullscreen API is not available to non-video content on iOS, so full screen is now a CSS
  "centre stage" mode: the top bar, controls and set-list footer hide and only the chart remains.
- A faint corner button and `Esc` leave it; a native fullscreen request is still attempted on desktop.
- The toggle is mirrored, so one iPad can put the whole band's screens into performance mode.

### Mirroring matches what is on stage
- **Scroll position** mirrors as a fraction of the chart, so different screen and font sizes land on the same
  spot. Sends are throttled with a trailing update.
- **Autoscroll** start/pause mirrors along with the speed; a device started remotely does not stop its peer
  when it reaches the end first.
- **Key and capo** mirror, and are stateful: opening a chart asserts the current key, a chart opened by a peer
  adopts it, and the host replays the current transposition to a device that joins while the song is open.
- **Full screen** mirrors.
- **Snapshots and live edits** still merge by `updatedAt`, with the host relaying guest changes.

### Small things
- Creator credit in the library header and README: **Ray Foo · www.rayfooproductions.com**.
- Stalled connections fail with a readable reason instead of hanging, and the host keeps a way to start over.
- Removed the QR scanner dependency churn: QR and camera are back, camera permission is requested from the tap
  (an iOS requirement) with a retry and a paste fallback.

## 0.1.0

- OnSong, ChordPro, text, zip, `.backup` and JSON import with preview, warnings and duplicate detection.
- Chord rendering with sections, transpose, capo and lyrics-only mode.
- Set lists with per-entry key/capo/notes and pedal-friendly navigation.
- Autoscroll with wake lock and keyboard/Bluetooth page-turner mappings.
- Night → daylight appearance slider.
- Storage panel with backup, export and restore.
- Offline PWA with a precached shell.
- Ultimate Guitar search launcher and clipboard paste cleaner.

# Changelog

Notable changes to Chordstand. The app is a static PWA deployed from `main`; every entry below is live at
<https://rayfoolshs.github.io/chordstand/> once its deploy run is green.

## Unreleased

### Demo songs removed
- The "Add demo songs" buttons and the bundled "Amazing Grace" and "Wagon Wheel" charts were removed. The
  demo charts were copyrighted lyrics, and the app is meant to be imported from your own library.

### Third-party notices
- `THIRD_PARTY_NOTICES.md` lists the license and notice text for every bundled open-source package (React,
  Dexie, PeerJS, sql.js, jsQR, etc.). The same file is served at `THIRD_PARTY_NOTICES.md` and linked from the
  privacy page. Regenerate with `npm run notices`.

### Optional Google Drive backups
- Storage & backups now has a **Google Drive** section. The player signs in with their Google account and the
  same backup zip is uploaded to a `Chordstand` folder in their Drive. The app stays static and backend-free.
- The Google Cloud OAuth client ID and secret are set once at build time with `VITE_GOOGLE_CLIENT_ID` and
  `VITE_GOOGLE_CLIENT_SECRET`; the player never sees them. Sign-in uses the OAuth 2.0 authorization code flow
  with PKCE, so the browser goes to Google's own consent page and returns to the app. Google's "Web
  application" client type requires the secret in the token exchange, so it is compiled into the app; it is
  a build-time value, not a true credential. The `drive.file` scope only lets the app see the files it
  created.
- **Back up to Google Drive** uploads on demand; **Restore from Google Drive** lists the backups and merges
  one back into the library. The access and refresh tokens live in `sessionStorage` and are revoked on
  disconnect.

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
- **Automatic clipboard pick-up:** a chart copied in Safari is added to the import preview as soon as the app
  becomes visible again. Only text that looks like a chord chart is accepted, and nothing is saved until you
  tap Import.
- Stalled connections fail with a readable reason instead of hanging, and the host keeps a way to start over.
- Removed the QR scanner dependency churn: QR and camera are back, camera permission is requested from the tap
  (an iOS requirement) with a retry and a paste fallback.

### Chord colour
- Chords are no longer locked to the theme accent. Pick preset inks or any custom colour from Library menu →
  Appearance (above the night/day slider) or the new palette button beside the sun/moon toggle in the song
  controls.
- The choice is contrast-adjusted for the current theme, so a bright or dark colour stays readable in both
  night and daylight, and it persists with the other stage settings.

### One-tap Ultimate Guitar import
- The Import screen now generates a personal bookmarklet (**Send chart to Chordstand**). Dragging it to the
  bookmarks bar, or copying it as a bookmark's address, turns "select → copy → switch app → paste" into one tap
  on a UG chart page.
- The bookmarklet reads the chart already on screen, adds the visible title and artist, strips UG's trailing
  marker and hands it over in the URL fragment. Chordstand routes straight to Import and shows the usual
  preview; duplicates stay unchecked and nothing is saved until Import is tapped.
- The fragment is cleared on arrival and the payload never leaves the browser. ADR-003 was amended: the app
  still does not fetch UG, and the bookmarklet is optional and user-installed.

## 0.1.0

- OnSong, ChordPro, text, zip, `.backup` and JSON import with preview, warnings and duplicate detection.
- Chord rendering with sections, transpose, capo and lyrics-only mode.
- Set lists with per-entry key/capo/notes and pedal-friendly navigation.
- Autoscroll with wake lock and keyboard/Bluetooth page-turner mappings.
- Night → daylight appearance slider.
- Storage panel with backup, export and restore.
- Offline PWA with a precached shell.
- Ultimate Guitar search launcher and clipboard paste cleaner.

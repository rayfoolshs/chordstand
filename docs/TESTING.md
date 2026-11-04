# Chordstand — Testing

## Automated

```bash
npm test           # Vitest, 34 tests
npx tsc --noEmit   # strict typecheck
npm run build      # typecheck + Vite build + service-worker asset injection
```

Coverage:

| File | What it covers |
| --- | --- |
| `src/core/core.test.ts` | OnSong metadata, title/artist shorthand, chords-over-lyrics, ChordPro directives, inline transpose, key detection, round-trip export, duplicates |
| `src/core/onsongBackup.test.ts` | SQLite song extraction from several column layouts, embedded metadata, association-table set lists, JSON-column set lists, media-table exclusion |
| `src/core/ug.test.ts` | UG search URL, page-chrome removal, metadata retention, blank-line collapsing |
| `src/sync/protocol.test.ts` | SDP compress/decompress, offer/answer types, whitespace/URL-wrapped codes, invalid codes |
| `src/sync/mirror.test.ts` | Host snapshot, merge by `updatedAt`, local edit/delete broadcasts, view broadcasts, no echo of remote applies |

## Manual smoke test (single device)

### Library and import
- [ ] Empty state shows Import and Add demo songs.
- [ ] Add demo songs → two songs appear.
- [ ] Search by title, artist, lyric and tag works.
- [ ] Book filter and sort modes work.
- [ ] Import a `.onsong` file and a zip; preview shows the chart, key and duplicate flags.
- [ ] Import an OnSong `.backup`; songs and set lists are recovered.
- [ ] PDFs are reported as skipped, not silently ignored.
- [ ] Delete a song from the row menu; its set-list entries disappear.

### Charts
- [ ] Chord symbols align with lyrics; sections are labelled.
- [ ] Key change re-renders chords and updates the key chip.
- [ ] Capo with key A + capo 1 shows "play in Ab" (not G#).
- [ ] Font size and Chords/Lyrics-only persist per song.
- [ ] Very long charts scroll without horizontal overflow.

### Set lists
- [ ] Create a set, add two songs, reorder both.
- [ ] Start the set, use Next/Previous, confirm footer position and next-song label.
- [ ] Pin a different key to an entry; reopen and confirm it persists.
- [ ] Edit an entry's capo and stage note.
- [ ] Stop and reopen the app; set list and overrides survive.

### Stage
- [ ] Scroll starts, pauses, resumes; progress bar advances.
- [ ] Space toggles scroll, arrows/PageUp/PageDown page, Home/End jump, `F` fullscreen on desktop.
- [ ] Wake lock is requested while scrolling (check the browser's screen-lock behaviour on iPad).

### Appearance
- [ ] Slider at 0, 25, 50, 75, 100 keeps lyrics and chords readable.
- [ ] Sun/moon toggles in the library header and song controls.
- [ ] Reload preserves the position; the old theme setting migrates.

### PWA
- [ ] `npm run build`, serve `dist/`, install to the home screen.
- [ ] Stop the server and reload: the shell still opens.
- [ ] The manifest and icons load with no console errors.

### Ultimate Guitar workflow
- [ ] Search opens UG's title search in a new tab.
- [ ] Copying a chord sheet and tapping "Paste from clipboard" creates a preview.
- [ ] The cleaner removes Download/Print/author lines but keeps `Key`, `Capo` and the chart.
- [ ] Import the candidate and edit it if needed.

## Manual test — two-device mirroring

### Prerequisites
- Two iPads (or an iPad and a Mac) running the deployed HTTPS app, on the **same Wi-Fi**.
- Camera permission for QR scanning, or the text-code fallback.
- Local network permission allowed on iOS.
- Different libraries on each device is the most useful test.

### Pair
- [ ] Device A: link icon → **Host this session**. A QR appears.
- [ ] Device B: link icon → **Join a session** → **Scan host code**. B accepts the offer.
- [ ] B shows an answer QR; A taps **Scan answer** and scans it.
- [ ] Both dialogs show **Devices are mirrored**; both header link icons turn green.
- [ ] If scanning fails: copy/show text codes and paste them; the same connection should form.

### Synchronisation
- [ ] B starts empty; after pairing it receives A's songs and sets.
- [ ] Add a song on B; it appears on A.
- [ ] Edit a song title on A; B updates.
- [ ] Delete a song on A; B removes it and its set entries.
- [ ] Create a set on B; A sees it; reorder it on A; B updates.
- [ ] Open a song on A; B opens the same song.
- [ ] Open a set list on B; A opens it.
- [ ] Change a set entry's key/capo; the other side sees the new values.
- [ ] Close the dialogs (keep apps open); make an edit; it still syncs.
- [ ] Tap **Stop mirroring** on one side; both stop and keep their data.
- [ ] Re-pair and confirm the libraries merge instead of duplicating.

### Failure cases
- [ ] Turn Wi-Fi off on one device mid-session; the other reports a disconnect.
- [ ] Deny camera permission; the text-code fallback still works.
- [ ] Put the devices on different networks; the host reports "No network path is available" or the connection fails cleanly.

## Environment note (important)

The automated Chromium used in this development sandbox emits **zero ICE candidates** (verified directly with a bare `RTCPeerConnection`). That means the live WebRTC handshake cannot be completed here; the offer/answer codes contain no candidates and the app correctly reports:

> No network path is available. Put both devices on the same Wi-Fi and allow local network access.

The signalling codec, dialog flow, protocol messages and mirror merge logic are covered by tests. **The live ICE/NAT path must be verified on two real devices before shipping the mirroring feature.**

## Bug report template

When reporting a mirroring issue, include:

- iPad model, iPadOS version, Safari version.
- App URL and whether it was installed to the home screen.
- Which pairing method (QR or text code) and which step failed.
- The exact on-screen error.
- Whether both devices were on the same SSID/VLAN and whether "Local Network" permission was granted.
- Console output if a Mac is attached to Safari Web Inspector.
- For OnSong backup failures, the table names shown in the import notice.

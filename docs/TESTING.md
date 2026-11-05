# Chordstand — Testing

## Automated

```bash
npm test           # Vitest, 45 tests
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
| `src/sync/mirror.test.ts` | Host snapshot, merge by `updatedAt`, local edit/delete broadcasts, view broadcasts, no echo of remote applies, guest-to-guest relay, scroll/autoscroll/key-capo sync and replay |

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

### Backups and storage
- [ ] Library menu → Storage & backups shows song/set counts and a plausible library size.
- [ ] "Save full backup to Files" opens the iOS share sheet and can save the zip to Files/iCloud Drive.
- [ ] On desktop, the same button downloads `chordstand-backup-YYYY-MM-DD.zip`.
- [ ] After saving, the panel says "Backup up to date / Just now" and the timestamp survives a reload.
- [ ] "Export all songs" produces a zip that re-imports cleanly.
- [ ] "Protect storage from cleanup" reports whether persistence was granted.
- [ ] Restoring the backup zip on a clean origin recreates songs and set lists.

### Ultimate Guitar workflow
- [ ] Search opens UG's title search in a new tab.
- [ ] Copying a chord sheet and tapping "Paste from clipboard" creates a preview.
- [ ] The cleaner removes Download/Print/author lines but keeps `Key`, `Capo` and the chart.
- [ ] Import the candidate and edit it if needed.

## Manual test — multi-device mirroring

### Prerequisites
- Two or more iPads (or iPads and a Mac) running the deployed HTTPS app, on the **same Wi-Fi**.
- Local network permission allowed on iOS.
- Different libraries on each device is the most useful test.

### Pair
- [ ] Device A: link icon → **Host this session**. A pairing code appears.
- [ ] Device B: link icon → **Join a session**; on the same Apple ID it reads the code automatically, otherwise use **Share** (AirDrop/Messages) and paste it.
- [ ] B shows an answer code; A picks it up automatically on return (same Apple ID), or A taps **Paste answer & connect** with the code B sent.
- [ ] Both dialogs show **Devices are mirrored**; both header link icons turn green.
- [ ] Different Apple IDs: **Share** on A → AirDrop/Messages to B → paste on B → **Share** on B → AirDrop/Messages to A → paste on A; the session forms.
- [ ] Tap **Share** on A and open the link on B; B joins automatically.
- [ ] Reopen the dialog after pairing: **Reconnect to last device** appears and resumes the same role.

### Adding more devices (3+)
- [ ] With A and B connected, A taps **Add another device**; a fresh code appears and B stays connected.
- [ ] Pair device C the same way; all three show the mirrored state.
- [ ] Add or edit a song on C; the change reaches A and B (the host relays it).
- [ ] Scroll or autoscroll on C; A and B follow.
- [ ] Close device C; A and B keep mirroring and A's connected count drops.
- [ ] Stop the host (A); the guests report the session ended but keep their data.

### Synchronisation
- [ ] B starts empty; after pairing it receives A's songs and sets.
- [ ] Add a song on B; it appears on A.
- [ ] Edit a song title on A; B updates.
- [ ] Delete a song on A; B removes it and its set entries.
- [ ] Create a set on B; A sees it; reorder it on A; B updates.
- [ ] Open a song on A; B opens the same song.
- [ ] Scroll a long chart on A; B follows to the same place (and scrolling B moves A).
- [ ] Tap Scroll on A; B starts autoscrolling the same chart; Pause on either stops both.
- [ ] Change the key (and capo) on A; B shows the same transposition.
- [ ] On B, leave the chart and reopen it; it opens with the mirrored key.
- [ ] With A showing a chart on a changed key, pair device C; C opens the chart at that key.
- [ ] Open a set list on B; A opens it.
- [ ] Change a set entry's key/capo; the other side sees the new values.
- [ ] Close the dialogs (keep apps open); make an edit; it still syncs.
- [ ] Tap **Stop mirroring** on one side; both stop and keep their data.
- [ ] Re-pair and confirm the libraries merge instead of duplicating.

### Failure cases
- [ ] Turn Wi-Fi off on one device mid-session; the other reports a disconnect.
- [ ] Clear the clipboard, then tap **Paste & continue**; the dialog explains it could not read the clipboard and the paste box still works.
- [ ] Put the devices on different networks; the host reports "No network path is available" or the connection fails cleanly.

## Environment note (important)

The automated Chromium used in this development sandbox emits **zero ICE candidates** (verified directly with a bare `RTCPeerConnection`). That means the live WebRTC handshake cannot be completed here; the offer/answer codes contain no candidates and the app correctly reports:

> No network path is available. Put both devices on the same Wi-Fi and allow local network access.

The signalling codec, dialog flow, protocol messages and mirror merge logic are covered by tests. **The live ICE/NAT path must be verified on two real devices before shipping the mirroring feature.**

## Bug report template

When reporting a mirroring issue, include:

- iPad model, iPadOS version, Safari version.
- App URL and whether it was installed to the home screen.
- Which pairing step (sharing the code, pasting the answer, or opening the link) failed.
- The exact on-screen error.
- Whether both devices were on the same SSID/VLAN and whether "Local Network" permission was granted.
- Console output if a Mac is attached to Safari Web Inspector.
- For OnSong backup failures, the table names shown in the import notice.

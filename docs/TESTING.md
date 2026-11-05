# Chordstand — Testing

## Automated

```bash
npm test           # Vitest, 42 tests
npx tsc --noEmit   # strict typecheck
npm run build      # typecheck + Vite build + service-worker asset injection
```

Coverage:

| File | What it covers |
| --- | --- |
| `src/core/core.test.ts` | OnSong metadata, title/artist shorthand, chords-over-lyrics, ChordPro directives, inline transpose, key detection, round-trip export, duplicates |
| `src/core/onsongBackup.test.ts` | SQLite song extraction from several column layouts, embedded metadata, association-table set lists, JSON-column set lists, media-table exclusion |
| `src/core/ug.test.ts` | UG search URL, page-chrome removal, metadata retention, blank-line collapsing |

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
- [ ] Space toggles scroll, arrows/PageUp/PageDown page, Home/End jump, `F` enters full screen, `Esc` leaves it.
- [ ] Full screen hides the top bar, controls and set-list footer and leaves only the chart; the small exit button restores them.
- [ ] Enter full screen on one mirrored iPad; the others hide their chrome too, and leaving restores them.
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
- Two or more iPads (or iPads and a Mac) running the deployed HTTPS app.
- Internet for the pairing handshake (the mirroring itself is direct).
- Camera permission if you want to test QR scanning.
- Different libraries on each device is the most useful test.

### Pair
- [ ] Device A: link icon → **Host this session**. A 4-digit code appears.
- [ ] Device B: link icon → **Join a session**, type the code → **Connect**.
- [ ] Both dialogs show **Devices are mirrored**; both header link icons turn green.
- [ ] Scanning works: A shows the QR, B taps **Scan QR** and the camera opens and reads it.
- [ ] Sharing works: **Share** on A and open the link on B; B joins automatically.
- [ ] A wrong or stale code shows a clear error and leaves the dialog usable.
- [ ] Reopen the dialog after pairing: **Reconnect to last device** appears and resumes the same role and code.

### Adding more devices (3+)
- [ ] With A and B connected, A's connected panel still shows the code.
- [ ] Device C joins with the same code; all three show the mirrored state.
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
- [ ] Enter full screen on A; B hides its chrome too, and leaving restores both.
- [ ] On B, leave the chart and reopen it; it opens with the mirrored key.
- [ ] With A showing a chart on a changed key, pair device C; C opens the chart at that key.
- [ ] Open a set list on B; A opens it.
- [ ] Change a set entry's key/capo; the other side sees the new values.
- [ ] Close the dialogs (keep apps open); make an edit; it still syncs.
- [ ] Tap **Stop mirroring** on one side; both stop and keep their data.
- [ ] Re-pair and confirm the libraries merge instead of duplicating.

### Failure cases
- [ ] Turn Wi-Fi off on one device mid-session; the other reports a disconnect.
- [ ] Join with a code nobody is hosting; the dialog says no session is hosting that code.
- [ ] Join with no internet; the dialog says it could not reach the pairing service.
- [ ] Stop the host; guests report the session ended and keep their data.

## Environment note (important)

The automated Chromium used in this development sandbox cannot complete a live WebRTC connection, so the
handshake itself is only exercised on real devices. The merge, relay and sync logic is covered by automated
tests; pairing was verified manually on two iPads.

## Bug report template

When reporting a mirroring issue, include:

- iPad model, iPadOS version, Safari version.
- App URL and whether it was installed to the home screen.
- The 4-digit code used, and whether the host or the joiner failed.
- The exact on-screen error.
- Whether both devices had internet for pairing, and whether they were on the same network.
- Console output if a Mac is attached to Safari Web Inspector.
- For OnSong backup failures, the table names shown in the import notice.

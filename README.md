# Chordstand

**Live:** https://rayfoolshs.github.io/chordstand/

A local-first chord chart and set list app for working musicians. Built as a better-behaved alternative to OnSong for a band that already has a big `.onsong` library.

- **Import-first**: drop in a zip of `.onsong` files, ChordPro, plain text, or paste a chart. Review every song before it is saved.
- **Per-set key and capo**: the song stays in its original key; each set list entry can be transposed or capo'd independently.
- **Stage controls**: autoscroll, font sizing, lyrics-only mode, fullscreen, and keyboard/Bluetooth page-turner support.
- **Night → daylight slider**: blend the whole interface continuously, with a one-tap dark/light toggle in the library header and song controls.
- **Mirror multiple devices**: pair iPads over the local network with a pasted code or a shared link; one hosts, the others join, and songs, set lists and the current screen stay in sync with no server.
- **Bring in chords from the web**: search Ultimate Guitar from the Import screen, copy a chart and paste it straight in (or use the clipboard button).
- **Offline PWA**: installs to the iPad home screen, works with no network, keeps the screen awake while scrolling.
- **No accounts, no subscription, no server**. Everything is stored in the browser's IndexedDB on your device.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # parser + transpose unit tests
npm run build      # production build in dist/
npm run preview    # serve the production build
```

Deploy `dist/` to any static host (Cloudflare Pages, Netlify, Vercel, GitHub Pages at a domain root). The service worker, manifest and icons follow Vite's base path, so both root hosting and a GitHub Pages project subpath such as `/chordstand/` work. HTTPS is required for PWA installation and wake lock.

This repo deploys itself to GitHub Pages on every push to `main` via `.github/workflows/deploy.yml`. The workflow sets `PAGES_BASE` to the repository name, runs the tests, builds, and publishes `dist/`.

## Documentation

- [Build plan](docs/BUILD_PLAN.md) — scope, milestones, current status, risks.
- [Architecture](docs/ARCHITECTURE.md) — data model, import/parser pipeline, sync protocol, theme engine.
- [Testing](docs/TESTING.md) — automated coverage, manual QA, multi-device mirroring checklist.
- [Design decisions](docs/DECISIONS.md) — why local-first, WebRTC pairing, and no Ultimate Guitar scraping.

### Install on iPad

1. Deploy, then open the site in Safari.
2. Share → **Add to Home Screen**.
3. Launch Chordstand from the home screen. The installed app gets its own storage, which is exempt from Safari's 7-day inactivity eviction.

## Importing your OnSong library

In OnSong on the iPad:

1. **Songs → All Songs → Select**, or select a few representative songs first.
2. **Share → Export**.
3. Choose **OnSong** as the file format, then **Save to Files** or Dropbox.
4. On the Mac, zip the exported folder:

   ```bash
   cd ~/Downloads/OnSong-Export && zip -r ~/Desktop/onsong-library.zip .
   ```

5. In Chordstand, open **Import** and drop the zip. Every chart is parsed into a preview with warnings, duplicates already unchecked, and PDFs listed as skipped.

**Or drop an OnSong `.backup` file directly.** OnSong backups are ZIP archives containing `OnSong.sqlite3`, so Chordstand reads the database, recovers songs with their metadata, and rebuilds set lists. Media, PDFs and audio inside the backup are ignored for now. In OnSong: gear → **Backup** → save to Files/Dropbox, then drop the `.backup` into Chordstand.

If a backup uses a database layout Chordstand does not recognise, the preview reports the table names it found — send me that line and I can add the mapping. OnSong's closed `.onsongarchive` format is not supported; use **Backup** or **Export** instead.

Supported inputs:

| Format | Notes |
| --- | --- |
| `.onsong` | Metadata header, chords-over-lyrics, bracketed chords, sections, ChordPro directives |
| `.chordpro` `.cho` `.crd` `.pro` | `{title:}`, `{start_of_chorus}`, `{comment:}`, inline transpose |
| `.txt` | Same parser; title falls back to the first line or filename |
| `.zip` | Any mix of the above, including folder hierarchies |
| `.backup` | OnSong backup archive; reads `OnSong.sqlite3` and rebuilds songs and set lists |
| `.json` | A Chordstand backup file |

PDFs and scanned images are **not** supported yet. Inline `{key:}` and `{capo:}` directives are preserved in the source text but are not applied mid-chart.

## Mirroring devices

Chordstand instances can mirror directly over the local network — no accounts, no relay, no internet. One iPad is the **host**; any number of others **join** it (the host relays changes between them).

1. Put the devices on the same Wi-Fi.
2. On device A: **link icon → Host this session**. A pairing code appears.
3. On device B: **link icon → Join a session** and paste the code — or tap **Share** on A and open the link on B, which joins automatically.
4. B shows an answer code. Paste it on A with **Paste answer & connect**. The link icon turns green when connected.
5. To add a third device, A taps **Add another device** in the connected panel and repeats steps 3–4. Each extra device pairs with the host once.

There is no QR code and no camera: the code is exchanged by copy/paste or the share sheet (AirDrop, Messages). On the same Apple ID, **Universal Clipboard** carries a copied code straight onto the other iPad, so it is one tap each way and no typing. When the host returns to the app with the guest's answer on the clipboard, it is picked up automatically — best effort, since iOS may still ask to allow the paste.

Chordstand remembers whether this iPad hosted or joined last time. **Reconnect to last device** resumes that role in one tap per device, reusing the clipboard.

Once connected:

- Songs, set lists and library edits merge both ways (newest `updatedAt` wins on a conflict), and the host relays them so every device converges.
- Picking a song or set list on any device opens it on the others.
- Changing a chart's key or capo transposes it on the others, and opening a chart adopts the mirrored key even on a device that was not watching.
- Scrolling a chart on one device scrolls the others to the same place (a fraction of the chart, so different screen and font sizes still line up).
- Starting or pausing autoscroll on one device does the same on the others, so the second screen keeps pace hands-free.
- Key, capo and stage notes travel with set list entries.
- Closing the dialog keeps the session running; the header link icon stays green. **Stop mirroring** ends it.
- The data channel is encrypted (DTLS) and direct. Every app must stay open.

If the host reports *"No network path is available"*, check that both devices really are on the same Wi-Fi and allow local network access when iOS asks.

## Searching Ultimate Guitar

The Import screen has a **Find chords online** card:

1. Type a song or artist and tap **Search UG**. Ultimate Guitar opens in a new tab.
2. Copy the chord sheet from their page.
3. Return to Chordstand and tap **Paste from clipboard** (or paste into the box below).
4. Review the imported chart, fix anything the parser could not read, and import.

Chordstand does **not** download UG pages itself. Their terms and robots rules prohibit automated scraping, the charts are copyrighted, and their Cloudflare/CORS setup blocks browser fetches anyway. Copying a chart you can already see keeps the workflow legal and reliable. The paste cleaner removes UG's page chrome (Download, Print, author/date lines) while keeping the chart and its `Key`, `Capo` and `Tuning` metadata.

## Stage controls

| Action | Keyboard / pedal |
| --- | --- |
| Play / pause autoscroll | `Space`, `P` |
| Page down / up | `PageDown` / `PageUp`, `ArrowDown` / `ArrowUp` |
| Next / previous song (at the top/bottom of the chart) | `ArrowRight` / `ArrowLeft` |
| Scroll to top / bottom | `Home` / `End` |
| Fullscreen | `F` |

Bluetooth pedals (AirTurn, PageFlip, iRig BlueBoard) present as keyboards on iPadOS, so set the pedal to its keyboard/HID mode and the mappings above work. Web Bluetooth is not available in Mobile Safari.

- **Key** transposes the chart live; spelling follows the key being played.
- **Capo** shows "Capo N · play in X" and shifts the chord shapes.
- **Chords on / Lyrics only** hides chord symbols for singers.
- **Appearance** lives in Library menu → Appearance: drag between Night stage and Daylight, or tap the sun/moon button in the library header and song controls. The choice persists.
- **Pin to set** saves the current key and capo to the set list entry, not the song.
- Tapping the chart while scrolling does not pause it (deliberate: prevents accidental stops). Use the Scroll button or the pedal.

## Data and backups

Charts live in IndexedDB in this browser profile. There is no server and no cloud sync; mirroring is direct between devices over your local network. The original uploaded `.zip`/`.backup`/`.onsong` files are **not** copied onto the iPad — only the parsed songs and metadata are kept, so a backup is the only copy you can move into the Files app or iCloud Drive.

**Library menu → Storage & backups** shows:

- Song and set-list counts and estimated library size.
- Total browser storage used and the available quota.
- When you last saved a backup.
- **Save full backup to Files** — opens the iOS share sheet so you can save the zip to Files/iCloud Drive in one step (falls back to a normal download).
- **Export all songs** — a zip of `.onsong` files that can be imported anywhere.
- **Protect storage from cleanup** — requests persistent storage from the browser.

Keep an external backup after a big import. Deleting the home-screen app, clearing Safari data or wiping the iPad removes the local library, and browser storage can be cleared by the OS under pressure.

Stage state (key, capo, scroll speed, font size) and the appearance slider are stored locally so charts and the interface open the way you left them.

## How it is put together

```
src/
  core/
    types.ts        Song, SetList, ChartLine, ChordSegment
    parser.ts       OnSong + ChordPro parsing, key detection, round-trip export
    chords.ts       chord/key parsing, transposition, capo maths
    import.ts       zip/text reading, duplicate detection, backup export
    onsongBackup.ts OnSong.sqlite3 extraction (lazy sql.js)
    ug.ts           Ultimate Guitar paste cleanup and search URL
    demo.ts         two public-domain demo charts
  sync/
    protocol.ts     S2S message types + compressed pairing codes
    SyncSession.ts  WebRTC peer connection and data channel
    mirror.ts       snapshot merge, live diff, view sync
    manager.ts      host/join flow
  store/            Dexie schema, app store, settings, theme engine
  hooks/
    useStage.ts     autoscroll, wake lock, fullscreen, pedal hotkeys
  components/       Library, SongView, Setlists, ImportView, sync dialog, editors
docs/               build plan, architecture, testing, decisions
.github/            GitHub Pages workflow
```

The parser keeps each song's raw source text, so export is lossless even for constructs the renderer does not understand yet. Rendering parses on demand and applies transposition at display time, which means key changes never rewrite the chart.

## Known limitations

- PDF/image charts, backing tracks, MIDI and projection are not implemented.
- Mirroring is LAN-only and hub-and-spoke: one host relays to the guests, so the host is a single point of failure and a handful of devices is the practical limit. It needs local-network permission and the live ICE path still needs verification on physical devices (see [Testing](docs/TESTING.md)).
- Mirroring conflicts are last-write-wins; a song deleted offline can be reintroduced by a peer's snapshot.
- Ultimate Guitar cannot be fetched automatically for legal and technical reasons; the app links to their search and imports what you copy.
- Inline `{key:}` / `{capo:}` changes are stored but ignored while rendering.
- Chords-over-lyrics alignment is column-based, exactly like OnSong. Sloppy spacing in the source will show up as sloppy alignment.
- Fullscreen is desktop-only; iOS Safari does not expose the Fullscreen API for non-video content.
- Wake lock requires iPadOS 16.4+ and can be affected by WebKit bugs in home-screen mode. Disabling auto-lock in Settings is the reliable fallback.

## Roadmap

1. Verify and harden mirroring on physical iPads (multi-device relay, reconnect, tombstones, conflict review).
2. PDF charts with page-turn and crop.
3. Song editor improvements: chord picker, repeat/bar shorthand, section reordering via Flow.
4. Library virtualization and a 2,000-song performance pass.
5. Backing tracks, click, and set-list auto-advance.
6. External display / projector output.
7. Optional hosted relay for cross-network mirroring.

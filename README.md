# Chordstand

A local-first chord chart and set list app for working musicians. Built as a better-behaved alternative to OnSong for a band that already has a big `.onsong` library.

- **Import-first**: drop in a zip of `.onsong` files, ChordPro, plain text, or paste a chart. Review every song before it is saved.
- **Per-set key and capo**: the song stays in its original key; each set list entry can be transposed or capo'd independently.
- **Stage controls**: autoscroll, font sizing, lyrics-only mode, fullscreen, and keyboard/Bluetooth page-turner support.
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

Deploy `dist/` to any static host (Cloudflare Pages, Netlify, Vercel, GitHub Pages at a domain root). The service worker, manifest and icons expect to live at `/`. HTTPS is required for PWA installation and wake lock.

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

For a full library, OnSong's **Backup** (gear → Backup) works too. If it produces a folder, zip it first. Chordstand's own **Library → Download full backup** produces a zip that can be restored directly from the Import screen.

Supported inputs:

| Format | Notes |
| --- | --- |
| `.onsong` | Metadata header, chords-over-lyrics, bracketed chords, sections, ChordPro directives |
| `.chordpro` `.cho` `.crd` `.pro` | `{title:}`, `{start_of_chorus}`, `{comment:}`, inline transpose |
| `.txt` | Same parser; title falls back to the first line or filename |
| `.zip` | Any mix of the above, including folder hierarchies |
| `.json` | A Chordstand backup file |

PDFs and scanned images are **not** supported yet. Inline `{key:}` and `{capo:}` directives are preserved in the source text but are not applied mid-chart.

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
- **Pin to set** saves the current key and capo to the set list entry, not the song.
- Tapping the chart while scrolling does not pause it (deliberate: prevents accidental stops). Use the Scroll button or the pedal.

## Data and backups

Charts live in IndexedDB in this browser profile. There is no server and no sync.

- **Library → Export all songs** produces a zip of `.onsong` files you can import anywhere.
- **Library → Download full backup** includes songs, set lists and metadata for one-tap restore.
- Keep a backup after a big import. Browser storage can be cleared by the OS under pressure, even for installed PWAs.

Session state (current key, capo, scroll speed, font size) is stored per song in `localStorage` so a chart opens the way you left it.

## How it is put together

```
src/
  core/
    types.ts        Song, SetList, ChartLine, ChordSegment
    parser.ts       OnSong + ChordPro parsing, key detection, round-trip export
    chords.ts       chord/key parsing, transposition, capo maths
    import.ts       zip/text reading, duplicate detection, backup export
    demo.ts         two public-domain demo charts
    core.test.ts    parser and transposer tests
  store/
    db.ts           Dexie / IndexedDB schema
    useStore.ts     songs, set lists, navigation
    useSettings.ts  persisted stage preferences
  hooks/
    useStage.ts     autoscroll, wake lock, fullscreen, pedal hotkeys
  components/       Library, SongView, Setlists, ImportView, editor, modals
```

The parser keeps each song's raw source text, so export is lossless even for constructs the renderer does not understand yet. Rendering parses on demand and applies transposition at display time, which means key changes never rewrite the chart.

## Known limitations

- PDF/image charts, backing tracks, MIDI, projection and cloud sync are not implemented.
- Inline `{key:}` / `{capo:}` changes are stored but ignored while rendering.
- Chords-over-lyrics alignment is column-based, exactly like OnSong. Sloppy spacing in the source will show up as sloppy alignment.
- Fullscreen is desktop-only; iOS Safari does not expose the Fullscreen API for non-video content.
- Wake lock requires iPadOS 16.4+ and can be affected by WebKit bugs in home-screen mode. Disabling auto-lock in Settings is the reliable fallback.

## Roadmap

1. PDF charts with page-turn and crop.
2. Song editor improvements: chord picker, repeat/bar shorthand, section reordering via Flow.
3. Band sharing: export a "band pack" (songs + set list) and optional real-time sync.
4. Backing tracks, click, and set-list auto-advance.
5. External display / projector output.

# Sending a chart to Chordstand with an iOS Shortcut

Chordstand accepts a chart in the URL itself:

```
https://rayfoolshs.github.io/chordstand/#import=<url-encoded chart>
```

Opening such a link launches the app, loads the chart into the **import preview**, and clears the hash so a
reload does not import it twice. An iOS Shortcut can build that link from whatever you share out of Safari, so
a chart goes from Ultimate Guitar to a reviewable preview in two taps.

## Build the Shortcut (once, about two minutes)

1. Open **Shortcuts → +** and name it **Send to Chordstand**.
2. Tap the **ⓘ** (Details) button:
   - Turn on **Show in Share Sheet**.
   - Under **Share Sheet Types**, deselect all and choose **Text**.
   - Keep **Receive Text input from Share Sheet** at the top of the shortcut.
3. Add a **URL Encode** action. Its input is the **Shortcut Input**.
4. Add a **Text** action and type:

   ```
   https://rayfoolshs.github.io/chordstand/#import=
   ```

   Then, right after `#import=`, insert the **URL Encoded Text** variable (tap the variable bar above the
   keyboard). The action should read `…/#import=[URL Encoded Text]` with no space.
5. Add an **Open URLs** action whose URL is the **Text** from step 4.
6. Done. It appears in the share sheet as **Send to Chordstand**.

## Use it

1. In Safari, on the Ultimate Guitar tab, **select the chart text** (long-press → Select All inside the chord
   sheet) and tap **Share**.
2. Choose **Send to Chordstand**.
3. Chordstand opens on the Import screen with the chart in the preview. Check it, then tap **Import**.

Selecting the text matters: sharing the page URL only sends the address, not the chart.

## Caveats worth knowing

- **The link opens in Safari, not the installed home-screen app.** iOS does not hand web links to a PWA, and
  Safari has its own IndexedDB, so a chart imported this way lands in the Safari copy of your library rather
  than the installed app's. If you perform from the home-screen app, the clipboard route (Import → **Paste from
  clipboard**) keeps everything in one library.
- **URL length.** Charts are percent-encoded, so a very long chart produces a very long URL (a 6,000-character
  chart becomes roughly 18,000 characters). iOS handles that, but a chart of several thousand lines may be
  rejected. Chordstand ignores payloads over 60,000 characters.
- **Nothing is fetched from Ultimate Guitar.** The Shortcut only carries text you selected yourself, which keeps
  the workflow inside their terms — Chordstand still never downloads a page.
- Chords are copyrighted. Use the shortcut for charts you are entitled to use.

## Related

- [Importing your OnSong library](../README.md#importing-your-onsong-library)
- [Searching Ultimate Guitar](../README.md#searching-ultimate-guitar)
- [Design decisions](DECISIONS.md) — ADR-003 explains why Chordstand does not scrape.

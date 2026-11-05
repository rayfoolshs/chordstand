# Chordstand — Design Decisions

Short ADR-style notes for the choices that shape the app.

## ADR-001 — Local-first, no backend

**Decision:** store songs and set lists in IndexedDB; ship a static PWA; no accounts and no application backend.

**Why:** the band needs the app to work in pubs, churches and rehearsal rooms with poor Wi-Fi. Static hosting is free and private. Backups and file export replace server-side safety.

**Cost:** no automatic cross-device sync (mirroring is explicit), storage lives with the browser, and Safari can evict non-installed storage. Pairing does borrow a public signalling service for a few seconds (see ADR-002), so it is not strictly offline.

## ADR-002 — Pairing with PeerJS, mirroring peer-to-peer

**Decision:** let PeerJS broker the handshake against its free public service, then mirror over the resulting direct data channel. The host claims a 4-digit code; guests type it, scan a QR, or open a share link. One iPad hosts and the others join it; the host relays messages between guests (hub-and-spoke).

**Why:** the hand-written offer/answer shuttle was fragile on iPadOS — the manual exchange worked, but ICE reported `connected` while the data channel never opened, and there was no serverless way to carry the answer back without a second scan or paste. PeerJS is widely exercised on iOS Safari and collapses pairing to one step. A 4-digit code also fits a stage context where reading a long code aloud is impractical.

**Cost:** pairing now needs internet and depends on a third party (the public PeerJS cloud). Four digits are convenient rather than secret, so anyone who learns the code can join while the host is hosting. The host remains a single point of failure, and a handful of devices is the practical limit.

**Alternatives considered:** keeping the serverless two-QR flow (no infrastructure, but two scans and a host that must scan); a self-hosted signalling server (more control, more setup); a full mesh (no single point of failure, but O(N²) pairing).

## ADR-003 — No scraping of Ultimate Guitar

**Decision:** provide a search launcher, a clipboard paste button, a UG text cleaner and an optional
user-installed bookmarklet. The app itself never fetches UG pages.

**Why:** UG's terms and robots rules prohibit automated extraction; chord sheets include copyrighted lyrics and arrangements; browser CORS and Cloudflare would block a static client anyway; a server-side scraper would put the operator at legal and operational risk.

**Cost:** importing a UG chart is either copy → paste, or one tap on the bookmarklet, rather than a silent
background import.

**Alternatives considered:** unofficial UG APIs/scrapers (rejected), a bundled browser extension (rejected:
distribution and permission overhead for the same page-read), licensed catalog integrations such as
SongSelect/PraiseCharts (a future option for users with accounts).

**Amendment — bookmarklet:** the bookmarklet is scoped to a single page the user is already viewing and runs
only on an explicit tap. It reads the chart element, adds the visible title/artist, and opens Chordstand with
the text in the URL fragment. It does not crawl, paginate, use accounts or export in bulk, and Chordstand still
shows the chart in the import preview — nothing is saved until the user taps Import. The bookmarklet is
generated locally per deployment, not distributed as an extension or invoked automatically. Residual ToS risk
remains and is accepted by the person who installs it. A future licensed catalog integration would remove this
trade-off.

## ADR-004 — Keep the raw chart source

**Decision:** every `Song` stores `source` verbatim; parsing and transposition happen at render time; export regenerates the metadata header and preserves the body.

**Why:** imports are never destructive. Unknown OnSong/ChordPro constructs survive a round trip even if the renderer does not understand them yet.

**Cost:** a little duplication (metadata both in fields and source) and the need to keep export in sync with the parser.

## ADR-005 — Lazy SQLite for OnSong backups

**Decision:** load `sql.js` and its WASM only when a `.backup` is opened.

**Why:** `.backup` files contain `OnSong.sqlite3`, so text parsing alone is insufficient. Lazy loading keeps the normal app bundle small and fast.

**Cost:** a ~670 KB WASM download on first backup import, and a heuristic schema extractor because OnSong does not publish its database layout.

## ADR-006 — Continuous appearance with derived contrast

**Decision:** model appearance as a 0–100 value, ramp the background night → dusk → day, and derive text/accent colours with contrast checks instead of interpolating every colour naively.

**Why:** a simple dark-to-light interpolation collapses text contrast in the middle. Deriving text and accents keeps charts readable at every position and gives a usable "dusk" state.

**Cost:** colours are computed in JavaScript rather than being a pure CSS theme; the mid-tone ramp is intentionally non-linear.

## ADR-007 — Host-authoritative initial view

**Decision:** on connect, the host sends its current screen; the guest does not. After that, both sides broadcast view changes.

**Why:** if both sent their current screen, they would swap screens on connect and then echo each other. Host authority makes the first screen deterministic.

**Cost:** a guest who is already on a song may be moved to the host's screen when pairing. That matches the "conductor" mental model of a band session.

## ADR-008 — Last-write-wins library merge

**Decision:** merge snapshots by id and `updatedAt`; broadcast full entities on every change; suppress echoes with a remote-apply guard.

**Why:** simple, deterministic and sufficient for a small band setup. Set list data is self-contained, so entries travel with their parent.

**Cost:** no tombstones; deletions made offline can be reintroduced by a peer snapshot. No merge UI for simultaneous edits. These are documented as v1 limitations.

## ADR-009 — Full screen as a CSS mode, not the Fullscreen API

**Decision:** implement full screen by hiding the app chrome with a CSS class on the song screen, and only
attempt the native Fullscreen API as a bonus.

**Why:** iOS Safari does not expose the Fullscreen API to non-video content, so the API-based version silently
did nothing on the iPad — the device the app is built for. A CSS mode works everywhere, including the installed
PWA, and is trivially mirrored to other devices.

**Cost:** the browser's own chrome (Safari's toolbar) stays visible when running in a tab; the installed
home-screen app has no browser chrome, so it looks properly full screen there. The mode must also keep safe-area
insets in mind, which the stylesheet does.

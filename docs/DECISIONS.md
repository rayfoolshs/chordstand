# Chordstand — Design Decisions

Short ADR-style notes for the choices that shape the app.

## ADR-001 — Local-first, no backend

**Decision:** store songs and set lists in IndexedDB; ship a static PWA; no accounts or server.

**Why:** the band needs the app to work in pubs, churches and rehearsal rooms with poor Wi-Fi. Static hosting is free and private. Backups and file export replace server-side safety.

**Cost:** no automatic cross-device sync (mirroring is explicit), storage lives with the browser, and Safari can evict non-installed storage.

## ADR-002 — Mirroring over WebRTC, paired without a server

**Decision:** use a direct WebRTC data channel with offline SDP exchange. Pair by sharing the code (copy/paste or the share sheet, with a `#pair=` link that auto-joins). No signalling server. One iPad hosts and the others join it; the host relays messages between the guests (hub-and-spoke).

**Why:** the requirement was devices on the same network, with no infrastructure. WebRTC is encrypted, browser-native, and works without an account. Sharing the code removes the need to type SDP, and dropping the camera avoids iOS camera-permission and gesture problems.

**Cost:** pairing is a deliberate two-step ceremony per device; ICE can fail on locked-down networks; the host is a single point of failure and a handful of devices is the practical limit; the implementation cannot be verified in a browser environment that exposes no ICE candidates.

**Alternatives considered:** a local Node sync server (reliable but needs a laptop and HTTP-only PWA), a hosted relay (best UX, cross-network, but needs infrastructure and an internet connection), a full mesh (no single point of failure, but O(N²) pairing).

## ADR-003 — No scraping of Ultimate Guitar

**Decision:** provide a search launcher, a clipboard paste button and a UG text cleaner. Do not fetch UG pages inside the app.

**Why:** UG's terms and robots rules prohibit automated extraction; chord sheets include copyrighted lyrics and arrangements; browser CORS and Cloudflare would block a static client anyway; a server-side scraper would put the operator at legal and operational risk.

**Cost:** importing a UG chart is copy → paste rather than one tap. The search is still one tap, and the paste is one tap if the clipboard contains the chart.

**Alternatives considered:** unofficial UG APIs/scrapers (rejected), browser extensions/bookmarklets that extract the page (still ToS-risky), licensed catalog integrations such as SongSelect/PraiseCharts (a future option for users with accounts).

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

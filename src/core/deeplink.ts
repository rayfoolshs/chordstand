/**
 * Deep-link import: `#import=<url-encoded chart>` opens the import preview with
 * the chart already loaded. This is what an iOS Shortcut sends, so a chart can
 * travel from Safari's share sheet into Chordstand without any clipboard access.
 */

const PREFIX = '#import='

/** Longest chart we will accept; guards against a malformed or hostile link. */
const MAX_LENGTH = 60_000

/** Read (and clear) a pending import from the URL hash. Safe to call repeatedly. */
export function readPendingImport(): string | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash
  if (!hash.startsWith(PREFIX)) return null

  const raw = hash.slice(PREFIX.length)
  clearHash()

  if (!raw || raw.length > MAX_LENGTH * 3) return null
  try {
    const text = decodeURIComponent(raw.replace(/\+/g, ' ')).trim()
    if (!text || text.length > MAX_LENGTH) return null
    return text
  } catch {
    return null
  }
}

function clearHash(): void {
  try {
    history.replaceState(null, '', window.location.pathname + window.location.search)
  } catch {
    // History is unavailable in some embedded contexts; the hash is harmless.
  }
}

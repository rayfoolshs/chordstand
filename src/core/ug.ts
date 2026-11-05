/**
 * Utility helpers for charts copied out of Ultimate Guitar's web player.
 * Chordstand never fetches UG pages itself: their terms, robots rules and
 * browser CORS/Cloudflare protections all block that. Copying a chart the
 * user can already see is the part we can support.
 */

const SITE_CHROME = [
  /^ultimate[- ]guitar(\.com)?$/i,
  /^ug tabs?$/i,
  /^download$/i,
  /^print$/i,
  /^rate this (tab|chords)$/i,
  /^add to playlist$/i,
  /^share$/i,
  /^report$/i,
  /^versions?$/i,
  /^interactive$/i,
  /^powered by.*/i,
  /^transpose$/i,
]

const CHROME_PREFIXES = /^(author|last edit|created|updated|views|difficulty):/i

const BRACKET_CHORD = /\[[A-G][#b]?[^\]]*\]/g
const CHORD_LINE =
  /^\s*[A-G][#b]?(?:m|maj|min|m|sus|add|dim|aug|°)?\d*(?:\/[A-G][#b]?)?(?:\s+[A-G][#b]?(?:m|maj|min|sus|add|dim|aug|°)?\d*(?:\/[A-G][#b]?)?)*\s*$/gm
const TAB_META = /^(?:key|capo|tuning)\s*[:=]/im

/**
 * Is this clipboard text plausibly a chord chart? An automatic clipboard read
 * must never turn unrelated content (a URL, a message, a phone number) into an
 * import candidate, so require real chart signals.
 */
export function looksLikeChordChart(input: string): boolean {
  const text = input.trim()
  if (text.length < 40 || text.length > 200_000) return false

  if ((text.match(BRACKET_CHORD) ?? []).length >= 2) return true
  if ((text.match(CHORD_LINE) ?? []).filter((line) => line.trim()).length >= 2) return true
  return TAB_META.test(text) && text.length > 120
}

export function ultimateGuitarSearchUrl(query: string): string {
  return `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(query.trim())}`
}

export function cleanUltimateGuitarText(input: string): string {
  const normalised = input
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/gi, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')

  const lines = normalised.split('\n')
  const kept: string[] = []
  let blankRun = 0

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      blankRun += 1
      if (blankRun <= 1) kept.push('')
      continue
    }
    blankRun = 0

    if (SITE_CHROME.some((pattern) => pattern.test(trimmed))) continue
    if (CHROME_PREFIXES.test(trimmed)) continue

    // UG sometimes leaves a trailing "Song - Artist" breadcrumb after the
    // chart; keep everything else intact.
    kept.push(line)
  }

  return kept.join('\n').trim()
}

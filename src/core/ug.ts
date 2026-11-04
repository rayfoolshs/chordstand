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

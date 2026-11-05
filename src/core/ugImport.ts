/**
 * Bridge for the optional Ultimate Guitar bookmarklet.
 *
 * The bookmarklet runs in the UG page the user is already looking at: it reads
 * the chart element, builds a title/artist header and opens Chordstand with the
 * text in the URL fragment. Chordstand never fetches UG itself. The fragment is
 * not sent to any server, and the chart still lands in the import preview.
 */

/** Safari starts truncating very long URLs; charts are normally a few KB. */
const MAX_ENCODED = 60_000
const MAX_DECODED = 45_000

const HASH_PREFIX = '#ug='
const QUEUE_KEY = 'chordstand.pendingUgImport'

export const UG_IMPORT_EVENT = 'chordstand:ug-import'

export function encodeUgPayload(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeUgPayload(encoded: string): string | null {
  if (!encoded || encoded.length > MAX_ENCODED) return null
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null

  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (encoded.length % 4)) % 4)
  try {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    const text = new TextDecoder().decode(bytes)
    if (!text.trim() || text.length > MAX_DECODED) return null
    return text
  } catch {
    return null
  }
}

/** Read a `#ug=` fragment without touching the URL. */
export function readUgHash(hash: string): string | null {
  if (!hash.startsWith(HASH_PREFIX)) return null
  return decodeUgPayload(hash.slice(HASH_PREFIX.length))
}

/** Consume a `#ug=` fragment and strip it so a refresh does not import twice. */
export function takeUgImportFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const payload = readUgHash(window.location.hash)
  if (!payload) return null
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  return payload
}

export function queueUgImport(text: string): void {
  try {
    window.sessionStorage.setItem(QUEUE_KEY, text)
  } catch {
    // Private browsing can refuse storage; the hash path already did its job.
  }
}

export function takeQueuedUgImport(): string | null {
  try {
    const text = window.sessionStorage.getItem(QUEUE_KEY)
    window.sessionStorage.removeItem(QUEUE_KEY)
    return text
  } catch {
    return null
  }
}

/**
 * The bookmarklet that runs on the UG tab. It is user-initiated, touches only
 * the page already on screen, and stops at Chordstand's review screen.
 */
export function buildUgBookmarklet(appUrl: string): string {
  const target = `${appUrl.replace(/#.*$/, '')}#ug=`
  const code = `(function(){
var pre=document.querySelector('pre');
if(!pre){alert('Open an Ultimate Guitar chord chart first.');return}
var match=document.title.match(/^(.+?)\\s+(?:chords|tabs|bass|ukulele|power|guitar pro|drums)\\s+by\\s+(.+?)\\s+@/i)||[];
var heading=document.querySelector('h1');
var title=heading?heading.textContent.trim().replace(/\\s+(chords|tabs|bass|ukulele|power|guitar pro|drums)$/i,'').trim():'';
var artist=(match[2]||'').trim();
if(!title)title=(match[1]||'').trim();
var body=pre.textContent.replace(/\\r\\n?/g,'\\n').replace(/\\n\\s*X\\s*$/,'');
var text=(title?title+'\\n'+(artist?artist+'\\n':'')+'\\n':'')+body;
var bytes=new TextEncoder().encode(text),binary='';
for(var i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
var encoded=btoa(binary).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
if(encoded.length>60000){alert('This chart is too large to send.');return}
window.open(${JSON.stringify(target)}+encoded,'_blank','noopener');
})()`
  return `javascript:${code.replace(/\s*\n\s*/g, ' ')}`
}

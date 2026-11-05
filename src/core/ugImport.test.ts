import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildUgBookmarklet, decodeUgPayload, encodeUgPayload, readUgHash } from './ugImport'

const APP = 'https://example.com/chordstand/'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('UG bookmarklet payload', () => {
  it('round-trips unicode text and line endings', () => {
    const text = "Swing Low\r\n[Chorus]\nD   G   D\nComin' for to carry me home — café"
    expect(decodeUgPayload(encodeUgPayload(text))).toBe(text)
  })

  it('produces a URL-safe fragment', () => {
    expect(encodeUgPayload('a/b+c?d=e&f')).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('rejects missing, malformed or oversized payloads', () => {
    expect(decodeUgPayload('')).toBeNull()
    expect(decodeUgPayload('not*base64')).toBeNull()
    expect(decodeUgPayload('A'.repeat(60_001))).toBeNull()
  })

  it('only reads the ug fragment', () => {
    const encoded = encodeUgPayload('Title\n\n[Verse]\nG  C\nlyric')
    expect(readUgHash(`#ug=${encoded}`)).toContain('Title')
    expect(readUgHash('#join=1234')).toBeNull()
  })
})

describe('buildUgBookmarklet', () => {
  it('is a single-line javascript URL pointing at this deployment', () => {
    const bookmarklet = buildUgBookmarklet(APP)
    expect(bookmarklet.startsWith('javascript:')).toBe(true)
    expect(bookmarklet).not.toContain('\n')
    expect(bookmarklet).toContain('https://example.com/chordstand/#ug=')
  })

  it('extracts the chart, title and artist from a UG page', () => {
    const opened: string[] = []
    vi.stubGlobal('document', {
      title: 'SWING LOW SWEET CHARIOT CHORDS by Misc Traditional @ Ultimate-Guitar.Com',
      querySelector: (selector: string) => {
        if (selector === 'pre') {
          return { textContent: '[Chorus]\r\n   D   G   D\r\nSwing low, sweet chariot\r\nX' }
        }
        if (selector === 'h1') return { textContent: 'Swing Low Sweet Chariot Chords ' }
        return null
      },
    })
    vi.stubGlobal('window', { open: (url: string) => opened.push(url) })
    vi.stubGlobal('alert', (message: string) => {
      throw new Error(message)
    })

    const code = buildUgBookmarklet(APP).replace(/^javascript:/, '')
    ;(0, eval)(code)

    expect(opened).toHaveLength(1)
    expect(opened[0].startsWith('https://example.com/chordstand/#ug=')).toBe(true)
    expect(decodeUgPayload(opened[0].split('#ug=')[1])).toBe(
      'Swing Low Sweet Chariot\nMisc Traditional\n\n[Chorus]\n   D   G   D\nSwing low, sweet chariot',
    )
  })
})

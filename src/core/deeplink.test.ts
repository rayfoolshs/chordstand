import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readPendingImport } from './deeplink'

const chart = 'Title: Test\n\n[G]Hello [C]world\n[G]Again'

function setUrl(hash: string) {
  const replaceState = vi.fn()
  Object.assign(globalThis, {
    window: { location: { hash, pathname: '/chordstand/', search: '' } },
    history: { replaceState },
  })
  return replaceState
}

describe('deep-link import', () => {
  beforeEach(() => {
    Object.assign(globalThis, { window: undefined, history: undefined })
  })

  it('decodes a chart from #import=', () => {
    const replaceState = setUrl(`#import=${encodeURIComponent(chart)}`)
    expect(readPendingImport()).toBe(chart)
    // The hash is cleared so a reload does not import it again.
    expect(replaceState).toHaveBeenCalledWith(null, '', '/chordstand/')
  })

  it('accepts + for spaces', () => {
    setUrl('#import=Title%3A+Test%0A%0A%5BG%5DHello')
    expect(readPendingImport()).toBe('Title: Test\n\n[G]Hello')
  })

  it('ignores other hashes', () => {
    setUrl('#join=1234')
    expect(readPendingImport()).toBeNull()
  })

  it('ignores empty or malformed payloads', () => {
    setUrl('#import=')
    expect(readPendingImport()).toBeNull()

    setUrl('#import=%E0%A4%A')
    expect(readPendingImport()).toBeNull()
  })
})

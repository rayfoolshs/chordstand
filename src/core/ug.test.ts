import { describe, expect, it } from 'vitest'
import { cleanUltimateGuitarText, ultimateGuitarSearchUrl } from './ug'

describe('Ultimate Guitar paste cleanup', () => {
  it('builds a title search URL', () => {
    expect(ultimateGuitarSearchUrl('Amazing Grace & Sons')).toBe(
      'https://www.ultimate-guitar.com/search.php?search_type=title&value=Amazing%20Grace%20%26%20Sons',
    )
  })

  it('removes site chrome while keeping metadata and chart text', () => {
    const raw = `Ultimate Guitar
Artist - Song
Tuning: E A D G B E
Key: G
Capo: 2
Difficulty: intermediate
Author: someone

[Verse 1]
G       C
Amazing grace

Download
Print
Rate this tab

Last edit: today
`
    const clean = cleanUltimateGuitarText(raw)
    expect(clean).not.toContain('Ultimate Guitar')
    expect(clean).not.toContain('Download')
    expect(clean).not.toContain('Rate this tab')
    expect(clean).not.toContain('Last edit')
    expect(clean).not.toContain('Author:')
    expect(clean).toContain('Key: G')
    expect(clean).toContain('Capo: 2')
    expect(clean).toContain('[Verse 1]')
    expect(clean).toContain('G       C')
    expect(clean).toContain('Amazing grace')
  })

  it('collapses repeated blank lines and strips zero-width characters', () => {
    const clean = cleanUltimateGuitarText('Title: Test\n\n\n\n[G]Hello\u200b world')
    expect(clean).toBe('Title: Test\n\n[G]Hello world')
  })
})

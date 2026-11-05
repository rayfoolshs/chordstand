import { describe, expect, it } from 'vitest'
import { previewChordColor } from './theme'

describe('previewChordColor', () => {
  it('follows the theme accent by default', () => {
    expect(previewChordColor(null, 0)).toBe('#f5b544')
  })

  it('keeps a custom colour that already has enough contrast', () => {
    expect(previewChordColor('#5aa9e6', 0)).toBe('#5aa9e6')
  })

  it('adjusts a custom colour for the daylight background', () => {
    const light = previewChordColor('#5aa9e6', 100)
    expect(light).toMatch(/^#[0-9a-f]{6}$/)
    expect(light).not.toBe('#5aa9e6')
  })

  it('never returns ink that matches the background', () => {
    expect(previewChordColor('#0b0d10', 0)).not.toBe('#0b0d10')
  })
})

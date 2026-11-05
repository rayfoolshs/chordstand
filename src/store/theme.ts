type RGB = [number, number, number]

const NIGHT_BG = '#0b0d10'
const DUSK_BG = '#3f362b'
const DAY_BG = '#f3efe6'
const LIGHT_TEXT = '#f2f5f8'
const DARK_TEXT = '#191919'
const WHITE = '#ffffff'
const BLACK = '#000000'

const ACCENT_NIGHT = '#f5b544'
const ACCENT_DAY = '#b45309'
const DANGER_NIGHT = '#ff6b6b'
const DANGER_DAY = '#c02626'
const GOOD_NIGHT = '#55d6a7'
const GOOD_DAY = '#0f7a57'

function parseColor(input: string): RGB {
  const value = input.trim()
  if (value.startsWith('#')) {
    const hex = value.slice(1)
    const expanded =
      hex.length === 3
        ? hex
            .split('')
            .map((char) => char + char)
            .join('')
        : hex
    return [
      Number.parseInt(expanded.slice(0, 2), 16),
      Number.parseInt(expanded.slice(2, 4), 16),
      Number.parseInt(expanded.slice(4, 6), 16),
    ]
  }
  const match = value.match(/-?\d+(\.\d+)?/g)
  if (!match || match.length < 3) return [0, 0, 0]
  return [Number(match[0]), Number(match[1]), Number(match[2])]
}

function toHex(color: RGB): string {
  const channel = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, '0')
  return `#${channel(color[0])}${channel(color[1])}${channel(color[2])}`
}

function mixRgb(a: RGB, b: RGB, amount: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ]
}

function mix(a: string, b: string, amount: number): string {
  return toHex(mixRgb(parseColor(a), parseColor(b), amount))
}

function relativeLuminance(color: RGB): number {
  const [r, g, b] = color.map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(parseColor(a))
  const second = relativeLuminance(parseColor(b))
  const light = Math.max(first, second)
  const dark = Math.min(first, second)
  return (light + 0.05) / (dark + 0.05)
}

/** Nudge a colour toward black or white until it is readable on the background. */
function ensureContrast(color: string, background: string, target = 4.5): string {
  const toward = contrastRatio('#ffffff', background) >= contrastRatio('#000000', background) ? WHITE : BLACK
  let adjusted = parseColor(color)

  for (let step = 0; step < 18; step += 1) {
    if (contrastRatio(toHex(adjusted), background) >= target) break
    adjusted = mixRgb(adjusted, parseColor(toward), 0.07)
  }

  return toHex(adjusted)
}

function readableInk(background: string): string {
  return contrastRatio('#1c1405', background) >= contrastRatio('#ffffff', background) ? '#1c1405' : '#ffffff'
}

/**
 * Blend the whole palette between the night and daylight themes.
 * 0 = night stage, 100 = daylight, anything in between is a continuous mix.
 */
export function applyAppearance(value: number, chordColor: string | null = null): void {
  const amount = Math.min(100, Math.max(0, value)) / 100
  const bg = backgroundFor(amount)
  const light = relativeLuminance(parseColor(bg)) >= 0.18
  const text = light ? DARK_TEXT : LIGHT_TEXT

  const panel = mix(bg, WHITE, 0.08)
  const panel2 = mix(bg, WHITE, light ? 0.16 : 0.04)
  const bgSoft = mix(bg, text, 0.035)
  const line = mix(bg, text, 0.14)
  const lineSoft = mix(bg, text, 0.08)
  const muted = mix(bg, text, 0.56)
  const muted2 = mix(bg, text, 0.36)

  const accentBase = light ? ACCENT_DAY : ACCENT_NIGHT
  const accent = ensureContrast(accentBase, panel, 4.5)
  const accentStrong = ensureContrast(mix(accent, text, 0.14), panel, 4.5)
  // Chords follow the accent unless the player picked their own ink.
  const chord = chordInk(chordColor, bg, light)
  const danger = ensureContrast(light ? DANGER_DAY : DANGER_NIGHT, bg, 4.5)
  const good = ensureContrast(light ? GOOD_DAY : GOOD_NIGHT, bg, 4.5)
  const [accentR, accentG, accentB] = parseColor(accentBase)

  const vars: Record<string, string> = {
    'bg': bg,
    'bg-soft': bgSoft,
    'panel': panel,
    'panel-2': panel2,
    'line': line,
    'line-soft': lineSoft,
    'text': text,
    'muted': muted,
    'muted-2': muted2,
    'accent': accent,
    'accent-strong': accentStrong,
    'accent-ink': readableInk(accent),
    'chord': chord,
    'danger': danger,
    'good': good,
    'overlay': `rgba(0, 0, 0, ${light ? 0.28 : 0.62})`,
    'shadow': light ? '0 24px 60px rgba(60, 45, 20, 0.18)' : '0 24px 60px rgba(0, 0, 0, 0.45)',
    'glow': `rgba(${accentR}, ${accentG}, ${accentB}, ${light ? 0.05 : 0.06})`,
  }

  const root = document.documentElement
  Object.entries(vars).forEach(([name, value]) => root.style.setProperty(`--${name}`, value))
  root.style.colorScheme = light ? 'light' : 'dark'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
}

/** The chord ink that will actually be painted for an appearance value. */
export function previewChordColor(chordColor: string | null, value: number): string {
  const amount = Math.min(100, Math.max(0, value)) / 100
  const bg = backgroundFor(amount)
  const light = relativeLuminance(parseColor(bg)) >= 0.18
  return chordInk(chordColor, bg, light)
}

function chordInk(chordColor: string | null, bg: string, light: boolean): string {
  return ensureContrast(chordColor ?? (light ? ACCENT_DAY : ACCENT_NIGHT), bg, 4.5)
}

function backgroundFor(amount: number): string {
  // Keep the first half comfortably dark (night → dusk), then ramp quickly
  // through the mid-tone so neither text nor chords sit on grey for long.
  if (amount <= 0.5) return mix(NIGHT_BG, DUSK_BG, amount / 0.5)
  const ramp = Math.sqrt((amount - 0.5) / 0.5)
  return mix(DUSK_BG, DAY_BG, ramp)
}

export function appearanceLabel(value: number): string {
  if (value <= 2) return 'Night stage'
  if (value < 28) return 'Dim'
  if (value < 58) return 'Dusk'
  if (value < 80) return 'Dawn'
  if (value < 98) return 'Soft daylight'
  return 'Daylight'
}

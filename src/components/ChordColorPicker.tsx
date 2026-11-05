import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { previewChordColor } from '../store/theme'
import { useSettings } from '../store/useSettings'
import { Icon } from './Icon'

export interface ChordPreset {
  name: string
  value: string
}

export const CHORD_PRESETS: ChordPreset[] = [
  { name: 'Amber', value: '#f5b544' },
  { name: 'Sky', value: '#5aa9e6' },
  { name: 'Mint', value: '#55d6a7' },
  { name: 'Rose', value: '#ff8fab' },
  { name: 'Violet', value: '#b79cff' },
]

export function chordColorName(color: string | null): string {
  if (!color) return 'Theme default'
  return CHORD_PRESETS.find((preset) => preset.value === color.toLowerCase())?.name ?? 'Custom'
}

interface ChordColorPickerProps {
  /** Called after a preset is picked, so a popover can close itself. */
  onPick?: () => void
}

export function ChordColorPicker({ onPick }: ChordColorPickerProps) {
  const chordColor = useSettings((state) => state.chordColor)
  const appearance = useSettings((state) => state.appearance)
  const setChordColor = useSettings((state) => state.setChordColor)

  const choose = (value: string | null) => {
    setChordColor(value)
    onPick?.()
  }

  return (
    <div className="chord-colors">
      <div className="chord-color-swatches" role="group" aria-label="Chord colour">
        <button
          type="button"
          className={`chord-swatch theme ${chordColor === null ? 'selected' : ''}`}
          style={{ background: previewChordColor(null, appearance) }}
          onClick={() => choose(null)}
          aria-pressed={chordColor === null}
          aria-label="Theme default chord colour"
          title="Theme default"
        >
          <Icon name="music" size={14} />
        </button>
        {CHORD_PRESETS.map((preset) => {
          const selected = chordColor?.toLowerCase() === preset.value
          return (
            <button
              key={preset.value}
              type="button"
              className={`chord-swatch ${selected ? 'selected' : ''}`}
              style={{ background: previewChordColor(preset.value, appearance) }}
              onClick={() => choose(preset.value)}
              aria-pressed={selected}
              aria-label={`${preset.name} chord colour`}
              title={preset.name}
            />
          )
        })}
      </div>
      <label className="chord-custom" title="Pick any chord colour">
        <input
          type="color"
          value={chordColor ?? '#f5b544'}
          onChange={(event) => setChordColor(event.target.value)}
          aria-label="Custom chord colour"
        />
        <span>Custom</span>
      </label>
    </div>
  )
}

/** Palette button for the stage controls, with a swatch panel anchored below it. */
export function ChordColorMenu() {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setPosition({
      top: Math.round(rect.bottom + 8),
      right: Math.round(Math.max(10, window.innerWidth - rect.right)),
    })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const close = () => setOpen(false)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        className={`icon-btn ${open ? 'is-open' : ''}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-label="Chord colour"
        aria-expanded={open}
        title="Chord colour"
      >
        <Icon name="palette" />
      </button>
      {open && position
        ? createPortal(
            <div
              ref={panelRef}
              className="chord-color-popover"
              style={{ top: position.top, right: position.right }}
              role="dialog"
              aria-label="Chord colour"
            >
              <span className="sheet-label">Chord colour</span>
              <ChordColorPicker onPick={() => setOpen(false)} />
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

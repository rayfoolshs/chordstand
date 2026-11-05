import { create } from 'zustand'

interface SettingsState {
  fontSize: number
  /** 0 = night stage, 100 = daylight. */
  appearance: number
  showChords: boolean
  showControls: boolean
  songKeys: Record<string, string>
  songCapos: Record<string, number>
  scrollSpeeds: Record<string, number>
  lastBackupAt?: number
  /** Chord ink chosen by the player; null follows the theme accent. */
  chordColor: string | null
  setFontSize: (size: number) => void
  setAppearance: (value: number) => void
  toggleAppearance: () => void
  setChordColor: (color: string | null) => void
  toggleChords: () => void
  toggleControls: () => void
  rememberKey: (songId: string, key: string) => void
  rememberCapo: (songId: string, capo: number) => void
  rememberSpeed: (songId: string, speed: number) => void
  markBackup: () => void
}

const STORAGE_KEY = 'chordstand.settings.v1'

interface Persisted {
  fontSize?: number
  appearance?: number
  /** Older builds stored a two-state theme. */
  theme?: 'night' | 'day'
  showChords?: boolean
  showControls?: boolean
  songKeys?: Record<string, string>
  songCapos?: Record<string, number>
  scrollSpeeds?: Record<string, number>
  lastBackupAt?: number
  chordColor?: string | null
}

function readSettings(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Persisted
  } catch {
    return {}
  }
}

const restored = readSettings()

export const useSettings = create<SettingsState>((set) => ({
  fontSize: restored.fontSize ?? 22,
  appearance:
    typeof restored.appearance === 'number'
      ? clamp(restored.appearance, 0, 100)
      : restored.theme === 'day'
        ? 100
        : 0,
  showChords: restored.showChords ?? true,
  showControls: restored.showControls ?? true,
  songKeys: restored.songKeys ?? {},
  songCapos: restored.songCapos ?? {},
  scrollSpeeds: restored.scrollSpeeds ?? {},
  lastBackupAt: restored.lastBackupAt,
  chordColor: isHexColor(restored.chordColor) ? restored.chordColor : null,

  setFontSize: (fontSize) => set({ fontSize: clamp(fontSize, 14, 56) }),
  setAppearance: (appearance) => set({ appearance: clamp(appearance, 0, 100) }),
  toggleAppearance: () => set((state) => ({ appearance: state.appearance >= 50 ? 0 : 100 })),
  setChordColor: (chordColor) => set({ chordColor: isHexColor(chordColor) ? chordColor : null }),
  toggleChords: () => set((state) => ({ showChords: !state.showChords })),
  toggleControls: () => set((state) => ({ showControls: !state.showControls })),
  rememberKey: (songId, key) =>
    set((state) => ({ songKeys: { ...state.songKeys, [songId]: key } })),
  rememberCapo: (songId, capo) =>
    set((state) => ({ songCapos: { ...state.songCapos, [songId]: capo } })),
  rememberSpeed: (songId, speed) =>
    set((state) => ({ scrollSpeeds: { ...state.scrollSpeeds, [songId]: speed } })),
  markBackup: () => set({ lastBackupAt: Date.now() }),
}))

useSettings.subscribe((state) => {
  try {
    const payload: Persisted = {
      fontSize: state.fontSize,
      appearance: state.appearance,
      showChords: state.showChords,
      showControls: state.showControls,
      songKeys: state.songKeys,
      songCapos: state.songCapos,
      scrollSpeeds: state.scrollSpeeds,
      lastBackupAt: state.lastBackupAt,
      chordColor: state.chordColor,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Storage can be unavailable in private browsing.
  }
})

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

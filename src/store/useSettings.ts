import { create } from 'zustand'

export type Theme = 'night' | 'day'

interface SettingsState {
  fontSize: number
  theme: Theme
  showChords: boolean
  showControls: boolean
  songKeys: Record<string, string>
  songCapos: Record<string, number>
  scrollSpeeds: Record<string, number>
  setFontSize: (size: number) => void
  setTheme: (theme: Theme) => void
  toggleChords: () => void
  toggleControls: () => void
  rememberKey: (songId: string, key: string) => void
  rememberCapo: (songId: string, capo: number) => void
  rememberSpeed: (songId: string, speed: number) => void
}

const STORAGE_KEY = 'chordstand.settings.v1'

interface Persisted {
  fontSize?: number
  theme?: Theme
  showChords?: boolean
  showControls?: boolean
  songKeys?: Record<string, string>
  songCapos?: Record<string, number>
  scrollSpeeds?: Record<string, number>
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
  theme: restored.theme ?? 'night',
  showChords: restored.showChords ?? true,
  showControls: restored.showControls ?? true,
  songKeys: restored.songKeys ?? {},
  songCapos: restored.songCapos ?? {},
  scrollSpeeds: restored.scrollSpeeds ?? {},

  setFontSize: (fontSize) => set({ fontSize: clamp(fontSize, 14, 56) }),
  setTheme: (theme) => set({ theme }),
  toggleChords: () => set((state) => ({ showChords: !state.showChords })),
  toggleControls: () => set((state) => ({ showControls: !state.showControls })),
  rememberKey: (songId, key) =>
    set((state) => ({ songKeys: { ...state.songKeys, [songId]: key } })),
  rememberCapo: (songId, capo) =>
    set((state) => ({ songCapos: { ...state.songCapos, [songId]: capo } })),
  rememberSpeed: (songId, speed) =>
    set((state) => ({ scrollSpeeds: { ...state.scrollSpeeds, [songId]: speed } })),
}))

useSettings.subscribe((state) => {
  try {
    const payload: Persisted = {
      fontSize: state.fontSize,
      theme: state.theme,
      showChords: state.showChords,
      showControls: state.showControls,
      songKeys: state.songKeys,
      songCapos: state.songCapos,
      scrollSpeeds: state.scrollSpeeds,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Storage can be unavailable in private browsing.
  }
})

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

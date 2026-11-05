export type SyncRole = 'host' | 'join'

export interface LastSession {
  role: SyncRole
  at: number
}

const STORAGE_KEY = 'chordstand.sync.v1'

/** The role this device played the last time two devices connected. */
export function readLastSession(): LastSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LastSession>
    if (parsed?.role !== 'host' && parsed?.role !== 'join') return null
    return { role: parsed.role, at: typeof parsed.at === 'number' ? parsed.at : 0 }
  } catch {
    return null
  }
}

export function rememberSession(role: SyncRole): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ role, at: Date.now() } satisfies LastSession))
  } catch {
    // Storage unavailable; the shortcut simply will not appear next time.
  }
}

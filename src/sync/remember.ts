export type SyncRole = 'host' | 'join'

export interface LastSession {
  role: SyncRole
  /** The short pairing code used last, so the same one can be reused. */
  code: string
  at: number
}

const STORAGE_KEY = 'chordstand.sync.v2'

/** The role and code this device used the last time it mirrored. */
export function readLastSession(): LastSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LastSession>
    if (parsed?.role !== 'host' && parsed?.role !== 'join') return null
    return {
      role: parsed.role,
      code: typeof parsed.code === 'string' ? parsed.code : '',
      at: typeof parsed.at === 'number' ? parsed.at : 0,
    }
  } catch {
    return null
  }
}

export function rememberSession(role: SyncRole, code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ role, code, at: Date.now() } satisfies LastSession))
  } catch {
    // Storage unavailable; the shortcut simply will not appear next time.
  }
}

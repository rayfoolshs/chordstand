import { create } from 'zustand'
import type { SessionStatus } from './SyncSession'

export type SyncMode = 'idle' | 'host' | 'join'

export interface SyncUiState {
  open: boolean
  mode: SyncMode
  status: SessionStatus | 'preparing' | 'waiting'
  code: string
  error: string
  notice: string
  /** Number of devices currently in the mirror session. */
  peerCount: number
  /** True while the host is pairing one more device on top of an existing session. */
  adding: boolean
  setOpen: (open: boolean) => void
  patch: (patch: Partial<Omit<SyncUiState, 'setOpen' | 'patch'>>) => void
  reset: () => void
}

export const useSync = create<SyncUiState>((set) => ({
  open: false,
  mode: 'idle',
  status: 'idle',
  code: '',
  error: '',
  notice: '',
  peerCount: 0,
  adding: false,
  setOpen: (open) => set({ open }),
  patch: (patch) => set(patch),
  reset: () => set({ mode: 'idle', status: 'idle', code: '', error: '', notice: '', peerCount: 0, adding: false }),
}))

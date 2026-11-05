import type { Setlist, Song } from '../core/types'
import type { View } from '../store/useStore'

export const PROTOCOL_VERSION = 1

/**
 * Messages exchanged over the peer data channel. Pairing is handled by PeerJS;
 * this is only the application-level sync traffic.
 */
export type SyncMessage =
  | { t: 'hello'; protocol: number }
  | { t: 'snapshot'; songs: Song[]; setlists: Setlist[] }
  | { t: 'song'; song: Song }
  | { t: 'song-del'; id: string }
  | { t: 'setlist'; setlist: Setlist }
  | { t: 'setlist-del'; id: string }
  | { t: 'view'; view: View }
  | { t: 'scroll'; songId: string; progress: number }
  | { t: 'autoscroll'; songId: string; active: boolean; speed: number }
  | { t: 'transpose'; songId: string; key: string; capo: number }

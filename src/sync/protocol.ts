import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate'
import type { Setlist, Song } from '../core/types'
import type { View } from '../store/useStore'

export const PROTOCOL_VERSION = 1
const PREFIX = 'CS1.'

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

export interface SignalPayload {
  v: number
  type: RTCSdpType
  sdp: string
  /** Id of the offer this payload belongs to, echoed by the answer so the host can reject a stale one. */
  t?: number
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** Compress an SDP offer/answer into a copy-paste friendly string. */
export function encodeSignal(description: RTCSessionDescriptionInit, offerId?: number): string {
  if (!description.sdp) throw new Error('Missing session description')
  const payload: SignalPayload = {
    v: PROTOCOL_VERSION,
    type: description.type,
    sdp: description.sdp,
  }
  if (typeof offerId === 'number') payload.t = offerId
  return `${PREFIX}${toBase64Url(zlibSync(strToU8(JSON.stringify(payload))))}`
}

export function decodeSignal(code: string): SignalPayload {
  const match = code.trim().match(/CS1\.[A-Za-z0-9_-]+/)
  if (!match) throw new Error('That does not look like a Chordstand pairing code.')

  let payload: SignalPayload
  try {
    payload = JSON.parse(strFromU8(unzlibSync(fromBase64Url(match[0].slice(PREFIX.length))))) as SignalPayload
  } catch {
    throw new Error('The pairing code is damaged. Try copying it again.')
  }

  if (!payload?.sdp || !['offer', 'answer'].includes(payload.type)) {
    throw new Error('The pairing code is not a WebRTC offer or answer.')
  }
  return payload
}

export function summariseSignal(code: string): string {
  return `CS1 • ${Math.max(1, Math.round(code.length / 100) / 10)}k characters`
}

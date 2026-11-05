import type Peer from 'peerjs'
import type { DataConnection } from 'peerjs'
import type { SyncMessage } from './protocol'

/** Loaded on demand so the ~300 kB library never ships in the main bundle. */
async function loadPeer(): Promise<typeof import('peerjs').default> {
  const module = await import('peerjs')
  return module.default
}

/** Namespace the short code so it only collides with other Chordstand sessions. */
const ID_PREFIX = 'chordstand-v1-'
const CODE_LENGTH = 4

export type LinkStatus = 'connecting' | 'connected' | 'disconnected' | 'failed'

export function randomCode(): string {
  const max = 10 ** CODE_LENGTH
  return String(Math.floor(Math.random() * max)).padStart(CODE_LENGTH, '0')
}

export function peerIdForCode(code: string): string {
  return `${ID_PREFIX}${code.trim()}`
}

/**
 * One connection to another device. Mirrors the shape the mirror engine expects,
 * so it can treat a PeerJS data connection like any other peer link.
 */
export class PeerLink {
  onMessage?: (message: SyncMessage) => void
  onClose?: () => void

  constructor(private conn: DataConnection) {
    conn.on('data', (data) => {
      const message = normalise(data)
      if (message) this.onMessage?.(message)
    })
    conn.on('close', () => this.onClose?.())
    conn.on('error', () => this.onClose?.())
  }

  get open(): boolean {
    return this.conn.open
  }

  send(message: SyncMessage): void {
    if (this.conn.open) {
      try {
        this.conn.send(message)
      } catch {
        // The connection closed mid-send; the close handler will clean up.
      }
    }
  }

  close(): void {
    this.onMessage = undefined
    this.onClose = undefined
    try {
      this.conn.close()
    } catch {
      // Already closed.
    }
  }
}

/** PeerJS delivers the object as sent; guard anyway since it is remote input. */
function normalise(data: unknown): SyncMessage | null {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as SyncMessage
    } catch {
      return null
    }
  }
  if (data && typeof data === 'object' && 't' in data) return data as SyncMessage
  return null
}

export interface HostHandle {
  code: string
  peer: Peer
}

/**
 * Claim a short code on the signalling server and accept connections on it.
 * Retries with a new code if the id is already taken.
 */
export function hostWithCode(
  onConnection: (link: PeerLink) => void,
  onFailure: (message: string) => void,
  preferredCode?: string,
): Promise<HostHandle> {
  return loadPeer().then(
    (PeerCtor) =>
      new Promise<HostHandle>((resolve, reject) => {
        let attempts = 0

        const tryCode = (code: string) => {
          attempts += 1
          const peer = new PeerCtor(peerIdForCode(code), { debug: 0 })
          let settled = false

          peer.on('open', () => {
            settled = true
            resolve({ code, peer })
          })

          peer.on('connection', (conn) => {
            const link = new PeerLink(conn)
            if (conn.open) onConnection(link)
            else conn.on('open', () => onConnection(link))
          })

          peer.on('error', (error) => {
            const type = (error as { type?: string }).type
            if (!settled && type === 'unavailable-id' && attempts < 5) {
              peer.destroy()
              tryCode(randomCode())
              return
            }
            if (!settled) {
              peer.destroy()
              reject(new Error(describe(type)))
              return
            }
            // Already hosting: report but keep the session alive where possible.
            if (type === 'network' || type === 'server-error' || type === 'socket-error') {
              onFailure('Lost contact with the pairing service. Other devices cannot join until it returns.')
            }
          })
        }

        tryCode(preferredCode && preferredCode.length === CODE_LENGTH ? preferredCode : randomCode())
      }),
  )
}

/** Connect to a host's short code. */
export function joinWithCode(code: string): Promise<{ link: PeerLink; peer: Peer }> {
  return loadPeer().then(
    (PeerCtor) =>
      new Promise<{ link: PeerLink; peer: Peer }>((resolve, reject) => {
        const peer = new PeerCtor({ debug: 0 })
        let settled = false

        const fail = (message: string) => {
          if (settled) return
          settled = true
          peer.destroy()
          reject(new Error(message))
        }

        peer.on('open', () => {
          const conn = peer.connect(peerIdForCode(code), { reliable: true })
          if (!conn) {
            fail('Could not start the connection. Try again.')
            return
          }

          const timer = window.setTimeout(() => {
            fail('No session answered that code. Check the code and that the other iPad is still hosting.')
          }, 20000)

          conn.on('open', () => {
            if (settled) return
            settled = true
            window.clearTimeout(timer)
            resolve({ link: new PeerLink(conn), peer })
          })

          conn.on('error', () => {
            window.clearTimeout(timer)
            fail('That code did not connect. Check it and try again.')
          })
        })

        peer.on('error', (error) => {
          const type = (error as { type?: string }).type
          if (type === 'peer-unavailable') {
            fail('No session is hosting that code. Check the code on the other iPad.')
            return
          }
          fail(describe(type))
        })
      }),
  )
}

function describe(type?: string): string {
  switch (type) {
    case 'browser-incompatible':
      return 'This browser cannot mirror devices.'
    case 'network':
    case 'socket-error':
    case 'server-error':
      return 'Could not reach the pairing service. Check the internet connection and try again.'
    case 'ssl-unavailable':
      return 'The pairing service could not be reached securely.'
    default:
      return 'Could not start the session. Try again.'
  }
}

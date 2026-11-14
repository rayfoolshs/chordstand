import type Peer from 'peerjs'
import { addPeer, removePeer, startMirroring, stopMirroring } from './mirror'
import { hostWithCode, joinWithCode, PeerLink, randomCode } from './PeerLink'
import { readLastSession, rememberSession } from './remember'
import { useSync } from './useSync'

/** How long to wait before the first reconnect attempt, and the cap. */
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 15000

/**
 * Pairing runs over PeerJS: the host claims a short numeric code and every other
 * device joins by entering it. Mirroring itself is still peer-to-peer; only the
 * handshake goes through the signalling service.
 *
 * A dropped link is retried automatically, so a hotspot or Wi-Fi blip does not
 * leave the session stuck. "Cancel" (disconnect) turns the retry off.
 */
class SyncManager {
  private peer: Peer | null = null
  private links: PeerLink[] = []
  private host = false
  private autoReconnect = true
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (this.links.length === 0) this.scheduleReconnect()
      })
      window.addEventListener('offline', () => {
        useSync.getState().patch({ notice: 'Network lost. Reconnecting when it returns…' })
      })
    }
  }

  async startHost(): Promise<void> {
    this.autoReconnect = true
    this.clearReconnectTimer()
    this.teardown()
    this.host = true
    useSync.getState().patch({ mode: 'host', status: 'preparing', code: '', error: '', notice: '' })

    const last = readLastSession()
    try {
      const { code, peer } = await hostWithCode(
        (link) => this.adopt(link),
        (message) => useSync.getState().patch({ notice: message }),
        last?.role === 'host' ? last.code : randomCode(),
      )
      this.peer = peer
      rememberSession('host', code)
      useSync.getState().patch({ code, status: 'waiting' })
    } catch (error) {
      this.fail(error)
    }
  }

  beginJoin(): void {
    this.autoReconnect = false
    this.cancelReconnect()
    this.teardown()
    this.host = false
    useSync.getState().patch({ mode: 'join', status: 'waiting', code: '', error: '', notice: '' })
  }

  async joinWithCode(code: string): Promise<void> {
    const trimmed = code.replace(/\D/g, '').slice(0, 4)
    if (trimmed.length !== 4) {
      useSync.getState().patch({ error: 'Enter the 4-digit code shown on the host iPad.' })
      return
    }

    this.autoReconnect = true
    this.clearReconnectTimer()
    this.teardown()
    this.host = false
    useSync.getState().patch({ mode: 'join', status: 'connecting', code: '', error: '', notice: '' })

    try {
      const { link, peer } = await joinWithCode(trimmed)
      this.peer = peer
      rememberSession('join', trimmed)
      this.adopt(link)
    } catch (error) {
      this.fail(error)
    }
  }

  /** Resume the role this device used last, reusing the same code. */
  async reconnect(): Promise<void> {
    const last = readLastSession()
    if (!last) {
      useSync.getState().patch({ notice: 'No previous session to reconnect to.' })
      return
    }
    if (last.role === 'host') {
      await this.startHost()
      return
    }
    if (last.code) {
      await this.joinWithCode(last.code)
      return
    }
    this.beginJoin()
  }

  disconnect(resetUi = true): void {
    this.autoReconnect = false
    this.cancelReconnect()
    this.teardown()
    if (resetUi) useSync.getState().reset()
  }

  private adopt(link: PeerLink): void {
    if (this.links.includes(link)) return
    this.links.push(link)

    this.reconnectAttempts = 0
    this.cancelReconnect()

    link.onClose = () => this.drop(link)

    if (this.links.length === 1) startMirroring(link, this.host)
    else addPeer(link, this.host)

    useSync
      .getState()
      .patch({ status: 'connected', error: '', notice: '', peerCount: this.links.length })
  }

  private drop(link: PeerLink): void {
    if (!this.links.includes(link)) return
    link.onClose = undefined
    this.links = this.links.filter((existing) => existing !== link)
    removePeer(link)
    link.close()

    if (this.links.length === 0) {
      stopMirroring()
      // The host keeps its code open so the device can rejoin.
      useSync.getState().patch({
        status: this.host ? 'waiting' : 'disconnected',
        error: this.host ? '' : 'The other device left the session. Reconnecting…',
        peerCount: 0,
      })
      this.scheduleReconnect()
    } else {
      useSync.getState().patch({ peerCount: this.links.length })
    }
  }

  private fail(error: unknown): void {
    this.teardown()
    useSync.getState().patch({
      status: 'failed',
      error: error instanceof Error ? error.message : 'Could not start the session. Try again.',
      peerCount: 0,
    })
    this.scheduleReconnect()
  }

  /** Retry with a short exponential backoff, so a blip does not end the session. */
  private scheduleReconnect(): void {
    if (!this.autoReconnect || this.reconnectTimer) return
    const last = readLastSession()
    if (!last) return

    this.reconnectAttempts += 1
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** (this.reconnectAttempts - 1), RECONNECT_MAX_MS)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.autoReconnect) return
      if (last.role === 'host') void this.startHost()
      else if (last.code) void this.joinWithCode(last.code)
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private cancelReconnect(): void {
    this.clearReconnectTimer()
    this.reconnectAttempts = 0
  }

  private teardown(): void {
    this.links.forEach((link) => {
      link.onClose = undefined
      link.close()
    })
    this.links = []
    if (this.peer) {
      try {
        this.peer.destroy()
      } catch {
        // Already destroyed.
      }
      this.peer = null
    }
    stopMirroring()
  }
}

export const syncManager = new SyncManager()

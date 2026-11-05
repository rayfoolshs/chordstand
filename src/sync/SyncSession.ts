import { decodeSignal, encodeSignal, type SyncMessage } from './protocol'

export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

/**
 * A direct WebRTC session between two Chordstand devices. SDP is exchanged
 * out of band (shared code) so there is no signalling server to host.
 */
export class SyncSession {
  private pc: RTCPeerConnection
  private channel: RTCDataChannel | null = null
  private closed = false
  private opened = false
  private connectTimer: number | null = null

  /** Id of the offer this session created (or is answering), echoed in the answer. */
  offerId: number | null = null

  onMessage?: (message: SyncMessage) => void
  onStatus?: (status: SessionStatus, detail?: string) => void
  onOpen?: () => void

  constructor() {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    this.pc.ondatachannel = (event) => this.bindChannel(event.channel)
    this.pc.onconnectionstatechange = () => {
      if (this.closed) return
      switch (this.pc.connectionState) {
        case 'connecting':
          this.onStatus?.('connecting')
          // If ICE/DTLS never completes, give up with an actionable message
          // instead of leaving the UI stuck on "Connecting…".
          this.armConnectTimeout()
          break
        case 'connected':
          this.clearConnectTimeout()
          this.onStatus?.('connected')
          break
        case 'disconnected':
          this.clearConnectTimeout()
          this.onStatus?.('disconnected', 'The connection dropped. Try moving closer to the other device.')
          break
        case 'failed':
          this.clearConnectTimeout()
          this.onStatus?.('failed', 'Could not connect. Both devices need to be on the same network.')
          break
        case 'closed':
          this.clearConnectTimeout()
          this.onStatus?.('disconnected')
          break
      }
    }
  }

  private armConnectTimeout(): void {
    this.clearConnectTimeout()
    this.connectTimer = window.setTimeout(() => {
      this.connectTimer = null
      if (this.closed || this.opened) return
      const local = countCandidates(this.pc.localDescription?.sdp)
      const remote = countCandidates(this.pc.remoteDescription?.sdp)
      const channel = this.channel?.readyState ?? 'none'
      this.onStatus?.(
        'failed',
        `Could not reach the other device after 25s (conn ${this.pc.connectionState}; ice ${this.pc.iceConnectionState}; channel ${channel}; candidates local ${local}, remote ${remote}). Check both iPads are on the same Wi-Fi, allow Local Network access, then start again.`,
      )
    }, 25000)
  }

  private clearConnectTimeout(): void {
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer)
      this.connectTimer = null
    }
  }

  async createOffer(): Promise<string> {
    this.bindChannel(this.pc.createDataChannel('chordstand', { ordered: true }))
    this.offerId = Date.now()
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    await waitForIce(this.pc)
    return this.localCode('Could not create a session offer.', this.offerId)
  }

  async acceptOffer(code: string): Promise<string> {
    const description = decodeSignal(code)
    if (description.type !== 'offer') throw new Error('That is an answer code. Use the host device.')

    this.offerId = typeof description.t === 'number' ? description.t : null
    await this.pc.setRemoteDescription({ type: 'offer', sdp: description.sdp })
    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer)
    await waitForIce(this.pc)
    return this.localCode('Could not create a session answer.', this.offerId ?? undefined)
  }

  /** False when the answer belongs to an earlier offer, so a stale paste cannot wedge the session. */
  async acceptAnswer(code: string): Promise<boolean> {
    const description = decodeSignal(code)
    if (description.type !== 'answer') throw new Error('That is an offer code. Use the host device.')
    if (this.offerId !== null && description.t !== this.offerId) return false
    await this.pc.setRemoteDescription({ type: 'answer', sdp: description.sdp })
    return true
  }

  send(message: SyncMessage): void {
    if (this.channel?.readyState === 'open') {
      this.channel.send(JSON.stringify(message))
    }
  }

  close(): void {
    this.closed = true
    this.clearConnectTimeout()
    try {
      this.channel?.close()
    } catch {
      // Already closed.
    }
    this.channel = null
    try {
      this.pc.close()
    } catch {
      // Already closed.
    }
    this.onMessage = undefined
    this.onOpen = undefined
    this.onStatus?.('disconnected')
  }

  private localCode(message: string, offerId?: number): string {
    const description = this.pc.localDescription
    if (!description?.sdp) throw new Error(message)
    if (!description.sdp.includes('a=candidate')) {
      throw new Error(
        'No network path is available. Put both devices on the same Wi-Fi and allow local network access.',
      )
    }
    return encodeSignal({ type: description.type, sdp: description.sdp }, offerId)
  }

  private bindChannel(channel: RTCDataChannel): void {
    if (this.channel) return
    this.channel = channel
    channel.binaryType = 'arraybuffer'

    channel.onopen = () => {
      if (this.closed) return
      this.opened = true
      this.clearConnectTimeout()
      this.onStatus?.('connected')
      this.onOpen?.()
    }

    channel.onclose = () => {
      if (this.closed) return
      this.onStatus?.('disconnected', 'The other device closed the session.')
    }
    channel.onerror = () => {
      if (this.closed) return
      this.onStatus?.('failed', 'The data channel failed.')
    }
    channel.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as SyncMessage
        this.onMessage?.(message)
      } catch {
        // Ignore malformed messages.
      }
    }
  }
}

function waitForIce(pc: RTCPeerConnection, timeout = 12000): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve()

    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      pc.removeEventListener('icegatheringstatechange', check)
      window.clearTimeout(timer)
      resolve()
    }
    const check = () => {
      if (pc.iceGatheringState === 'complete') finish()
    }

    pc.addEventListener('icegatheringstatechange', check)
    const timer = window.setTimeout(finish, timeout)
  })
}

function countCandidates(sdp?: string): number {
  if (!sdp) return 0
  const matches = sdp.match(/a=candidate:/g)
  return matches ? matches.length : 0
}

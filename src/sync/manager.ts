import { SyncSession } from './SyncSession'
import { addPeer, removePeer, startMirroring, stopMirroring } from './mirror'
import { readLastSession, rememberSession } from './remember'
import { useSync } from './useSync'

class SyncManager {
  private sessions: SyncSession[] = []
  private pending: SyncSession | null = null
  private host = false

  async startHost(options: { copyOffer?: boolean } = {}): Promise<void> {
    this.reset()
    this.host = true
    useSync.getState().patch({ mode: 'host', status: 'preparing', code: '', error: '', notice: '', adding: false })
    await this.beginOffer(options.copyOffer)
  }

  /** Host only: pair one more device without dropping the ones already connected. */
  async addDevice(): Promise<void> {
    if (!this.host || this.sessions.length === 0) return
    useSync.getState().patch({ status: 'preparing', code: '', error: '', notice: '', adding: true })
    await this.beginOffer(true)
  }

  beginJoin(): void {
    this.reset()
    this.host = false
    useSync.getState().patch({ mode: 'join', status: 'waiting', code: '', error: '', notice: '', adding: false })
  }

  async joinWithOffer(code: string): Promise<void> {
    this.reset()
    this.host = false
    useSync.getState().patch({ mode: 'join', status: 'preparing', code: '', error: '', notice: '', adding: false })

    try {
      const session = new SyncSession()
      this.pending = session
      this.wire(session)
      const answer = await session.acceptOffer(code)
      useSync.getState().patch({ code: answer, status: 'waiting' })
      // Put the answer on the clipboard so the host can pick it up automatically.
      const copied = await copyText(answer)
      useSync.getState().patch({
        notice: copied
          ? 'Answer copied. The host picks it up automatically when it returns; or tap Share to send it.'
          : '',
      })
    } catch (error) {
      this.failPending(error)
    }
  }

  /** Re-run the role this device used last, using the clipboard to skip a step when possible. */
  async reconnect(): Promise<void> {
    const last = readLastSession()
    if (!last) {
      useSync.getState().patch({ notice: 'No previous session to reconnect to.' })
      return
    }

    if (last.role === 'host') {
      await this.startHost({ copyOffer: true })
      return
    }

    let code = ''
    try {
      code = (await navigator.clipboard.readText()).trim()
    } catch {
      code = ''
    }
    if (/^CS1\./.test(code)) {
      await this.joinWithOffer(code)
      return
    }

    this.beginJoin()
    useSync.getState().patch({
      notice:
        'No host code on the clipboard yet. Tap Reconnect on the other iPad first, then try again — or paste its code.',
    })
  }

  async acceptAnswer(code: string): Promise<void> {
    if (!this.pending) return
    const current = useSync.getState()
    if (current.status === 'connecting' || current.status === 'connected') return
    useSync.getState().patch({ status: 'connecting', error: '' })
    try {
      await this.pending.acceptAnswer(code)
    } catch (error) {
      this.failPending(error)
    }
  }

  /** Abandon the device being paired, keeping any already-connected peers. */
  cancelPending(): void {
    const session = this.pending
    this.pending = null
    if (session) discard(session)
    if (this.sessions.length > 0) {
      useSync
        .getState()
        .patch({ status: 'connected', code: '', error: '', notice: '', adding: false, peerCount: this.sessions.length })
    } else {
      this.disconnect()
    }
  }

  disconnect(resetUi = true): void {
    this.reset()
    if (resetUi) useSync.getState().reset()
  }

  private async beginOffer(copyOffer?: boolean): Promise<void> {
    try {
      const session = new SyncSession()
      this.pending = session
      this.wire(session)
      const code = await session.createOffer()
      useSync.getState().patch({ code, status: 'waiting' })
      if (copyOffer) {
        const copied = await copyText(code)
        useSync.getState().patch({
          notice: copied
            ? 'Host code copied. Tap Reconnect on the other iPad, then paste the answer here.'
            : 'Code ready. Copy or share it with the other iPad.',
        })
      }
    } catch (error) {
      this.failPending(error)
    }
  }

  private wire(session: SyncSession): void {
    session.onStatus = (status, detail) => {
      // Wait for the data channel before claiming to be connected.
      if (status === 'connected') return
      if (status === 'disconnected' || status === 'failed') {
        this.dropSession(session, detail ?? '')
      } else {
        useSync.getState().patch({ status })
      }
    }

    session.onOpen = () => {
      if (this.pending === session) this.pending = null
      if (!this.sessions.includes(session)) this.sessions.push(session)
      rememberSession(this.host ? 'host' : 'join')
      if (this.sessions.length === 1) startMirroring(session, this.host)
      else addPeer(session, this.host)
      useSync
        .getState()
        .patch({ status: 'connected', error: '', notice: '', adding: false, peerCount: this.sessions.length })
    }
  }

  private dropSession(session: SyncSession, detail: string): void {
    const wasPending = this.pending === session
    if (wasPending) this.pending = null
    this.sessions = this.sessions.filter((existing) => existing !== session)
    discard(session)
    removePeer(session)

    if (this.sessions.length === 0) {
      stopMirroring()
      useSync
        .getState()
        .patch({ status: wasPending ? 'failed' : 'disconnected', error: detail, peerCount: 0, adding: false })
    } else {
      useSync.getState().patch({ status: 'connected', peerCount: this.sessions.length, adding: false })
    }
  }

  private failPending(error: unknown): void {
    const session = this.pending
    this.pending = null
    if (session) discard(session)
    const message = error instanceof Error ? error.message : 'Could not start the mirror session.'

    if (this.sessions.length > 0) {
      useSync
        .getState()
        .patch({ status: 'connected', error: message, adding: false, peerCount: this.sessions.length })
    } else {
      stopMirroring()
      useSync.getState().patch({ status: 'failed', error: message, peerCount: 0, adding: false })
    }
  }

  private reset(): void {
    const all = [...this.sessions, ...(this.pending ? [this.pending] : [])]
    this.sessions = []
    this.pending = null
    all.forEach(discard)
    stopMirroring()
  }
}

function discard(session: SyncSession): void {
  session.onStatus = undefined
  session.onMessage = undefined
  session.onOpen = undefined
  session.close()
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

export const syncManager = new SyncManager()

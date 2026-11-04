import { SyncSession } from './SyncSession'
import { startMirroring, stopMirroring } from './mirror'
import { useSync } from './useSync'

class SyncManager {
  private session: SyncSession | null = null
  private host = false

  async startHost(): Promise<void> {
    this.disconnect(false)
    this.host = true
    useSync.getState().patch({ mode: 'host', status: 'preparing', code: '', error: '', notice: '' })

    try {
      const session = new SyncSession()
      this.session = session
      this.wire(session)
      const code = await session.createOffer()
      useSync.getState().patch({ code, status: 'waiting' })
    } catch (error) {
      this.fail(error)
    }
  }

  beginJoin(): void {
    this.disconnect(false)
    this.host = false
    useSync.getState().patch({ mode: 'join', status: 'waiting', code: '', error: '', notice: '' })
  }

  async joinWithOffer(code: string): Promise<void> {
    this.disconnect(false)
    this.host = false
    useSync.getState().patch({ mode: 'join', status: 'preparing', code: '', error: '', notice: '' })

    try {
      const session = new SyncSession()
      this.session = session
      this.wire(session)
      const answer = await session.acceptOffer(code)
      useSync.getState().patch({ code: answer, status: 'waiting' })
    } catch (error) {
      this.fail(error)
    }
  }

  async acceptAnswer(code: string): Promise<void> {
    if (!this.session) return
    useSync.getState().patch({ status: 'connecting', error: '' })
    try {
      await this.session.acceptAnswer(code)
    } catch (error) {
      this.fail(error)
    }
  }

  disconnect(resetUi = true): void {
    this.session?.close()
    this.session = null
    stopMirroring()
    if (resetUi) useSync.getState().reset()
  }

  private wire(session: SyncSession): void {
    session.onStatus = (status, detail) => {
      // Wait for the data channel before claiming to be connected.
      if (status === 'connected') return
      if (status === 'disconnected' || status === 'failed') {
        stopMirroring()
        useSync.getState().patch({ status, error: detail ?? '' })
      } else {
        useSync.getState().patch({ status })
      }
    }

    session.onOpen = () => {
      useSync.getState().patch({ status: 'connected', error: '', notice: '' })
      startMirroring(session, this.host)
    }
  }

  private fail(error: unknown): void {
    this.session?.close()
    this.session = null
    stopMirroring()
    useSync.getState().patch({
      status: 'failed',
      error: error instanceof Error ? error.message : 'Could not start the mirror session.',
    })
  }
}

export const syncManager = new SyncManager()

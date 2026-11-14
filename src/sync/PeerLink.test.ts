import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataConnection } from 'peerjs'
import { PeerLink } from './PeerLink'

/** A stand-in for the parts of a PeerJS data connection the link uses. */
class FakeConnection {
  open = true
  sent: unknown[] = []
  handlers: Record<string, ((...args: unknown[]) => void)[]> = {}

  on(event: string, handler: (...args: unknown[]) => void) {
    ;(this.handlers[event] ??= []).push(handler)
    return this
  }

  send(data: unknown) {
    this.sent.push(data)
  }

  close() {
    this.open = false
    this.emit('close')
  }

  emit(event: string, ...args: unknown[]) {
    for (const handler of this.handlers[event] ?? []) handler(...args)
  }
}

const asConnection = (connection: FakeConnection) => connection as unknown as DataConnection

afterEach(() => {
  vi.useRealTimers()
})

describe('PeerLink', () => {
  it('pings and closes when the peer stops answering', () => {
    vi.useFakeTimers()
    const connection = new FakeConnection()
    const link = new PeerLink(asConnection(connection))
    const onClose = vi.fn()
    link.onClose = onClose

    vi.advanceTimersByTime(5000)
    expect(connection.sent).toEqual([{ t: 'ping' }])

    vi.advanceTimersByTime(15000)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('answers a ping and keeps a pong from reaching the app', () => {
    vi.useFakeTimers()
    const connection = new FakeConnection()
    const link = new PeerLink(asConnection(connection))
    const onMessage = vi.fn()
    link.onMessage = onMessage

    connection.emit('data', { t: 'ping' })
    expect(connection.sent).toEqual([{ t: 'pong' }])

    connection.emit('data', { t: 'pong' })
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('passes app messages to onMessage', () => {
    const connection = new FakeConnection()
    const link = new PeerLink(asConnection(connection))
    const onMessage = vi.fn()
    link.onMessage = onMessage

    connection.emit('data', { t: 'hello', protocol: 1 })
    expect(onMessage).toHaveBeenCalledWith({ t: 'hello', protocol: 1 })

    link.close()
  })
})

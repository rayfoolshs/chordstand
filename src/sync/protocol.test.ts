import { describe, expect, it } from 'vitest'
import { decodeSignal, encodeSignal } from './protocol'

const SDP = [
  'v=0',
  'o=- 123 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=ice-ufrag:abcd',
  'a=ice-pwd:supersecret',
  'a=candidate:1 1 udp 2113937151 192.168.1.20 55555 typ host generation 0',
  'a=setup:actpass',
  'a=mid:0',
].join('\r\n')

describe('pairing codes', () => {
  it('compresses and restores an offer', () => {
    const code = encodeSignal({ type: 'offer', sdp: SDP })
    expect(code.startsWith('CS1.')).toBe(true)

    const decoded = decodeSignal(code)
    expect(decoded.type).toBe('offer')
    expect(decoded.sdp).toBe(SDP)
  })

  it('compresses and restores an answer', () => {
    const code = encodeSignal({ type: 'answer', sdp: SDP })
    expect(decodeSignal(code).type).toBe('answer')
  })

  it('accepts codes with surrounding whitespace or a URL', () => {
    const code = encodeSignal({ type: 'offer', sdp: SDP })
    expect(decodeSignal(`  ${code}\n`).sdp).toBe(SDP)
    expect(decodeSignal(`https://example.com/#pair=${code}`).sdp).toBe(SDP)
  })

  it('rejects invalid codes', () => {
    expect(() => decodeSignal('not-a-code')).toThrow()
    expect(() => decodeSignal('CS1.abc')).toThrow()
  })

  it('carries the offer id when supplied', () => {
    const code = encodeSignal({ type: 'answer', sdp: SDP }, 42)
    expect(decodeSignal(code).t).toBe(42)
    expect(decodeSignal(encodeSignal({ type: 'offer', sdp: SDP })).t).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'
import { collaborationError } from './errors'
import { rtcConfiguration } from './network'

describe('collaboration transport errors and relay configuration', () => {
  it('extracts the actual Trystero structured failure without dumping invitation or identifiers', () => {
    expect(collaborationError({ error: 'could not connect to peer private-peer after exchanging SDP; configure TURN servers with turnConfig or rtcConfig.iceServers', roomId: 'private-room', secret: 'private-secret' })).toContain('TURN relay')
    expect(collaborationError({ error: { message: 'Signaling failed' } })).toBe('Signaling failed')
    expect(collaborationError({})).not.toContain('[object Object]')
    const cyclic: any = {}; cyclic.error = cyclic
    expect(collaborationError(cyclic)).not.toContain('[object Object]')
    expect(collaborationError({ error: 'incorrect room password when decrypting answer' })).toContain('new pairing code')
  })
  it('preserves direct STUN and adds an explicitly configured TURN fallback', () => {
    expect(rtcConfiguration().iceServers).toHaveLength(2)
    const result = rtcConfiguration({ turnUrl: 'turns:relay.example.com:443?transport=tcp', turnUsername: 'test', turnCredential: 'test-only', relayOnly: true })
    expect(result.iceTransportPolicy).toBe('relay')
    expect(result.iceServers?.at(-1)).toEqual({ urls: 'turns:relay.example.com:443?transport=tcp', username: 'test', credential: 'test-only' })
    expect(() => rtcConfiguration({ turnUrl: 'https://bad.example' })).toThrow('turn:')
    expect(() => rtcConfiguration({ turnUrl: 'turn:server:3478' })).toThrow('username')
    expect(() => rtcConfiguration({ relayOnly: true })).toThrow('Configure')
  })
})

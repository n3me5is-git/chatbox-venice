export interface ConnectionOptions {
  turnUrl?: string
  turnUsername?: string
  turnCredential?: string
  relayOnly?: boolean
}
/** Credentials are per connection, never included in the invitation or persisted. */
export function rtcConfiguration(options: ConnectionOptions = {}): RTCConfiguration {
  const iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }]
  if (options.turnUrl) {
    if (options.turnUrl.length > 300 || !/^turns?:[a-z\d.\[\]:-]+(?::\d+)?(?:\?transport=(?:udp|tcp))?$/i.test(options.turnUrl)) throw Error('Enter a valid turn: or turns: server address')
    if (!options.turnUsername?.trim() || !options.turnCredential || options.turnUsername.length > 512 || options.turnCredential.length > 2048) throw Error('Enter the TURN relay username and password')
    iceServers.push({ urls: options.turnUrl, username: options.turnUsername, credential: options.turnCredential })
  } else if (options.relayOnly) throw Error('Configure a TURN relay before enabling relay-only mode')
  return { iceServers, iceTransportPolicy: options.relayOnly ? 'relay' : 'all' }
}

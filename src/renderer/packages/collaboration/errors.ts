/** Never stringify a transport record: Trystero reports {error, appId, peerId, roomId}. */
export function collaborationError(value: unknown): string {
  let error = value
  for (let depth = 0; depth < 4; depth++) {
    if (typeof error === 'string' && error.trim()) {
      if (/could not connect to peer .* after exchanging SDP/i.test(error)) return 'The devices exchanged pairing information, but WebRTC could not connect. Try the same Wi-Fi or configure a TURN relay in Connection options on both devices.'
      if (/incorrect room password/i.test(error)) return 'The pairing invitation could not be verified. Ask the owner for a new pairing code.'
      return error.slice(0, 600)
    }
    if (!error || typeof error !== 'object') break
    const record = error as Record<string, unknown>
    error = record.message || record.error || record.cause
  }
  return 'The shared connection failed. Retry pairing while the owner keeps the app open.'
}

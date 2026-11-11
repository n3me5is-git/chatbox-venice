import { sha256 } from '@noble/hashes/sha256'

/** Hash decoded bytes, independent of filename and data-URL MIME spelling. */
export function mediaContentHash(data: string): string {
  const match = /^data:[^;,]+;base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(data)
  if (!match) throw new Error('Invalid local media data')
  const hash = sha256.create()
  const text = match[1].replace(/[\r\n]/g, '')
  for (let offset = 0; offset < text.length; offset += 65536) {
    const binary = atob(text.slice(offset, offset + 65536))
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
    try { hash.update(bytes) } finally { bytes.fill(0) }
  }
  return Array.from(hash.digest(), byte => byte.toString(16).padStart(2, '0')).join('')
}

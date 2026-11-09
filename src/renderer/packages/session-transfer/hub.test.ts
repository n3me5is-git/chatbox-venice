import { beforeEach, describe, expect, it, vi } from 'vitest'
import { keyPair } from '@/packages/collaboration/crypto'
import { hashTransferBytes, verifiedTransferBytes, type TransferManifest } from '@shared/session-transfer'
import type { PreparedTransfer } from './snapshot'
const network = vi.hoisted(() => ({ rooms: new Map<string, any>(), joins: 0, identity: undefined as any }))
vi.mock('@/packages/collaboration/transport', () => ({
  deviceIdentity: async () => network.identity,
  connectRoom(invite: any, _identity: any, host: boolean, handlers: any) {
    if (host) {
      network.rooms.set(invite.room, { handlers })
      return { close() { const room = network.rooms.get(invite.room); network.rooms.delete(invite.room); room?.guest?.leave('owner') }, remove() {} }
    }
    const room = network.rooms.get(invite.room), id = 'device-' + ++network.joins
    room.guest = handlers
    const hostLink = { id, send: async (value: unknown) => handlers.message(guestLink, structuredClone(value)) }
    const guestLink = { id: 'owner', send: async (value: unknown) => room.handlers.message(hostLink, structuredClone(value)) }
    queueMicrotask(() => handlers.connected(guestLink))
    return { close() { room.handlers.leave(id) }, remove() {} }
  },
}))
import { SessionTransferHub, parseTransferCode } from './hub'
async function source(length = 160000): Promise<PreparedTransfer> {
  const data = new Uint8Array(length).map((_, i) => i % 251)
  const digest = await hashTransferBytes((async function* () { yield data.slice() })())
  const manifest: TransferManifest = { version: 1, id: crypto.randomUUID(), lineage: 'a'.repeat(64), sourceDevice: 'owner', rootId: 'root', createdAt: Date.now(), sessions: [{ id: 'root', workspaceId: 'root', name: 'Work', revision: 1, directories: [], protected: false }], objects: [{ id: 'rows:root', sessionId: 'root', kind: 'rows', path: 'session.jsonl', name: 'Rows', mime: 'application/x-ndjson', ...digest, protected: false, deliverable: false }] }
  return { manifest, lineage: manifest.lineage, assertCurrent: vi.fn(async () => {}), dispose: vi.fn(async () => {}), sent: vi.fn(async () => {}), async *read(id) { if (id !== 'rows:root') throw Error('outside offer'); for (let at = 0; at < data.length; at += 65536) yield data.slice(at, at + 65536) } }
}
beforeEach(async () => { network.rooms.clear(); network.identity = await keyPair() })
describe('direct transfer admission, bounded streams and revocation', () => {
  it('requires sender admission, streams verified bytes with backpressure and confirms receipt', async () => {
    const owner = new SessionTransferHub(), receiver = new SessionTransferHub(), prepared = await source()
    const host = await owner.host('root', prepared), guest = await receiver.join(host.code, 'Phone')
    await vi.waitFor(() => expect(guest.status).toBe('waiting'))
    expect(guest.manifest).toBeUndefined(); expect(host.peer?.admitted).toBe(false)
    await expect(receiver.read(guest.id, 'rows:root').next()).rejects.toThrow('not ready')
    await owner.admit(host.id); expect(guest.status).toBe('ready')
    let bytes = 0
    for await (const chunk of verifiedTransferBytes(prepared.manifest.objects[0], receiver.read(guest.id, 'rows:root'))) { bytes += chunk.length; expect(guest.file!.queue.length).toBeLessThanOrEqual(2) }
    expect(bytes).toBe(160000); await receiver.verify(guest.id); await receiver.verify(guest.id, undefined, true)
    expect(host.status).toBe('complete'); expect(guest.status).toBe('complete'); expect(prepared.sent).toHaveBeenCalledOnce(); expect(prepared.dispose).toHaveBeenCalledOnce()
    owner.stopAll(); receiver.stopAll()
  })
  it('does not confuse live sharing and direct-transfer invitations', async () => {
    expect(() => parseTransferCode('CB2.invalid')).toThrow('Receive tab')
    const hub = new SessionTransferHub(), host = await hub.host('root', await source())
    expect(parseTransferCode(host.code).room).toBe(host.id)
    hub.stopAll()
  })
  it('cancels waiting streams on revocation and rejects changed source data before commit', async () => {
    const owner = new SessionTransferHub(), receiver = new SessionTransferHub(), prepared = await source(), host = await owner.host('root', prepared), guest = await receiver.join(host.code, 'PC')
    await vi.waitFor(() => expect(host.peer).toBeDefined()); await owner.admit(host.id)
    vi.mocked(prepared.assertCurrent).mockRejectedValueOnce(Error('Source changed'))
    await expect(receiver.verify(guest.id)).rejects.toThrow('Source changed')
    const signal = new AbortController(), reader = receiver.read(guest.id, 'rows:root', signal.signal)
    expect((await reader.next()).value?.length).toBeGreaterThan(0)
    signal.abort(); await expect(reader.next()).rejects.toThrow()
    owner.stopAll(); receiver.stopAll(); expect(prepared.dispose).toHaveBeenCalled()
  })
})

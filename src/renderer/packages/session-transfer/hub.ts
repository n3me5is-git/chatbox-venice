import { z } from 'zod'
import { TransferManifestSchema, type TransferManifest } from '@shared/session-transfer'
import { b64, un64, encodeInvitation, parseInvitation, makeInvitation, keyPair } from '@/packages/collaboration/crypto'
import { connectRoom, deviceIdentity, type Link, type Transport } from '@/packages/collaboration/transport'
import type { ConnectionOptions } from '@/packages/collaboration/network'
import { collaborationError } from '@/packages/collaboration/errors'
import type { PreparedTransfer } from './snapshot'

export const encodeTransferCode = (code: string) => 'CBT1.' + code.slice(4)
export function parseTransferCode(value: string) {
  const code = value.trim().replace(/^.*#/, '')
  if (!code.startsWith('CBT1.')) throw Error('Use a direct transfer code in the Receive tab. Sharing invitations belong in the Collaboration tab.')
  return parseInvitation('CB2.' + code.slice(5))
}
const uuid = z.string().uuid()
const Request = z.discriminatedUnion('type', [
  z.object({ type: z.literal('transfer-join'), name: z.string().trim().min(1).max(60) }).strict(),
  z.object({ type: z.literal('pull'), id: uuid, object: z.string().min(1).max(200) }).strict(),
  z.object({ type: z.literal('chunk-ack'), id: uuid, n: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('cancel'), id: uuid }).strict(),
  z.object({ type: z.literal('verify'), id: uuid }).strict(),
  z.object({ type: z.literal('received'), id: uuid }).strict(),
])
const Response = z.discriminatedUnion('type', [
  z.object({ type: z.literal('waiting') }).strict(),
  z.object({ type: z.literal('offer'), manifest: TransferManifestSchema }).strict(),
  z.object({ type: z.literal('chunk'), id: uuid, n: z.number().int().nonnegative(), data: z.string().max(44000), done: z.boolean() }).strict(),
  z.object({ type: z.literal('verified'), id: uuid }).strict(),
  z.object({ type: z.literal('closed') }).strict(),
  z.object({ type: z.literal('error'), id: uuid.optional(), message: z.string().max(1000) }).strict(),
])
type Pending = { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
export interface TransferHost {
  id: string; sessionId: string; code: string; source: PreparedTransfer; transport: Transport
  peer?: { link: Link; name: string; admitted: boolean; pull?: string }
  status: 'waiting' | 'sending' | 'complete'; error?: string; sentBytes: number
}
export interface TransferGuest {
  id: string; code: string; name: string; transport: Transport; link?: Link; manifest?: TransferManifest
  status: 'connecting' | 'waiting' | 'ready' | 'receiving' | 'complete' | 'disconnected'; error?: string
  pending: Map<string, Pending>
  result?: { rootId: string; sessions: number; downloaded: number; reused: number; warning: string }
  file?: { id: string; queue: Array<Uint8Array | null>; next: number; bytes: number; maximum: number; error?: Error; wake?: () => void }
}

/** One-shot transport, independent of live collaboration permissions and messages. */
export class SessionTransferHub {
  hosts = new Map<string, TransferHost>()
  guests = new Map<string, TransferGuest>()
  private listeners = new Set<() => void>()
  private version = 0
  private acks = new Map<string, Pending>()
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getVersion = () => this.version
  changed = () => { this.version++; for (const listener of this.listeners) listener() }
  activeCount = () => [...this.hosts.values()].filter(room => room.status !== 'complete').length + [...this.guests.values()].filter(room => !['complete', 'disconnected'].includes(room.status)).length
  async host(sessionId: string, source: PreparedTransfer, relay?: string, network?: ConnectionOptions) {
    if (this.hosts.size >= 8) throw Error('At most eight direct transfers can be active')
    const identity = await keyPair(), invite = makeInvitation(identity.publicKey)
    const room = { id: invite.room, sessionId, source, code: encodeTransferCode(encodeInvitation(invite)), status: 'waiting', sentBytes: 0 } as TransferHost
    room.transport = connectRoom(invite, identity, true, {
      message: (link, value) => this.receiveHost(room, link, value),
      leave: id => { if (room.peer?.link.id === id) { this.cancelAcks(room.id); room.peer = undefined; if (room.status !== 'complete') room.status = 'waiting'; this.changed() } },
      error: error => { room.error = collaborationError(error); this.changed() },
    }, relay, network)
    this.hosts.set(room.id, room); this.changed(); return room
  }
  async join(code: string, name: string, relay?: string, network?: ConnectionOptions) {
    const invite = parseTransferCode(code)
    if (this.hosts.has(invite.room)) throw Error('This device owns this transfer')
    if (this.guests.has(invite.room)) this.stop(invite.room)
    if (this.guests.size >= 8) throw Error('At most eight direct transfers can be active')
    name = z.string().trim().min(1).max(60).parse(name)
    const room = { id: invite.room, code, name, status: 'connecting', pending: new Map() } as TransferGuest
    room.transport = connectRoom(invite, await deviceIdentity(), false, {
      connected: link => { room.link = link; void link.send({ type: 'transfer-join', name }).catch(error => this.failGuest(room, error)) },
      message: (_link, value) => this.receiveGuest(room, value),
      leave: () => this.failGuest(room, Error('Direct transfer disconnected')),
      error: error => this.failGuest(room, error),
    }, relay, network)
    this.guests.set(room.id, room); this.changed(); return room
  }
  async admit(id: string) {
    const room = this.hosts.get(id), peer = room?.peer
    if (!room || !peer) throw Error('The receiving device is no longer connected')
    await room.source.assertCurrent()
    peer.admitted = true; room.error = undefined; room.status = 'sending'
    await peer.link.send({ type: 'offer', manifest: room.source.manifest }); this.changed()
  }
  private async receiveHost(room: TransferHost, link: Link, value: unknown) {
    if (this.hosts.get(room.id) !== room || room.status === 'complete') return
    const input = Request.parse(value)
    if (input.type === 'transfer-join') {
      if (room.peer && room.peer.link.id !== link.id) { await link.send({ type: 'error', message: 'Another device is already paired with this transfer' }); return }
      room.peer = { link, name: input.name, admitted: false }; room.error = undefined
      await link.send({ type: 'waiting' }); this.changed(); return
    }
    const peer = room.peer
    if (!peer || peer.link.id !== link.id || !peer.admitted) throw Error('The sender must approve this receiving device')
    const ackKey = (n: number) => room.id + ':' + input.id + ':' + n
    if (input.type === 'chunk-ack') { this.acks.get(ackKey(input.n))?.resolve(); return }
    if (input.type === 'cancel') { if (peer.pull === input.id) peer.pull = undefined; this.cancelAcks(room.id); return }
    // Keep the inbound message queue free for chunk acknowledgements.
    void (async () => {
      if (input.type === 'pull') {
        if (peer.pull) throw Error('A file transfer is already active')
        peer.pull = input.id
        try { await this.sendObject(room, peer, input.id, input.object) } finally { if (peer.pull === input.id) peer.pull = undefined }
      } else if (input.type === 'verify') { await room.source.assertCurrent(); await link.send({ type: 'verified', id: input.id }) }
      else if (input.type === 'received') {
        await room.source.sent(); room.status = 'complete'; await link.send({ type: 'verified', id: input.id }); await room.source.dispose(); this.changed()
      }
    })().catch(async error => { room.error = collaborationError(error); this.changed(); await link.send({ type: 'error', id: input.id, message: room.error.slice(0, 1000) }).catch(() => {}) })
  }
  private async sendObject(room: TransferHost, peer: NonNullable<TransferHost['peer']>, request: string, id: string) {
    const check = () => { if (this.hosts.get(room.id) !== room || room.peer !== peer || !peer.admitted || peer.pull !== request) throw Error('Direct transfer cancelled') }
    await room.source.assertCurrent(); let n = 0
    for await (const bytes of room.source.read(id)) {
      try { for (let at = 0; at < bytes.length; at += 32768) {
        check(); const part = bytes.subarray(at, at + 32768), key = room.id + ':' + request + ':' + n
        const ack = new Promise<void>((resolve, reject) => { const timer = setTimeout(() => { this.acks.delete(key); reject(Error('The receiving device timed out')) }, 30000); this.acks.set(key, { resolve, reject, timer }) })
        try { await Promise.all([peer.link.send({ type: 'chunk', id: request, n, data: b64(part), done: false }), ack]); check(); room.sentBytes += part.length; this.changed() }
        finally { const pending = this.acks.get(key); if (pending) clearTimeout(pending.timer); this.acks.delete(key) }
        n++
      } } finally { bytes.fill(0) }
    }
    check(); await peer.link.send({ type: 'chunk', id: request, n, data: '', done: true })
  }
  private receiveGuest(room: TransferGuest, value: unknown) {
    if (this.guests.get(room.id) !== room) return
    const input = Response.parse(value)
    if (input.type === 'waiting') room.status = 'waiting'
    if (input.type === 'offer') { if (room.status !== 'waiting') throw Error('Unexpected transfer offer'); room.manifest = input.manifest; room.status = 'ready'; room.error = undefined }
    if (input.type === 'closed') { this.failGuest(room, Error('The sender stopped this transfer')); return }
    if (input.type === 'verified' || input.type === 'error') {
      if (input.type === 'error') { room.error = input.message; if (room.file?.id === input.id) { room.file.error = Error(input.message); room.file.wake?.() } }
      if (input.id) { const pending = room.pending.get(input.id); if (pending) { clearTimeout(pending.timer); room.pending.delete(input.id); input.type === 'error' ? pending.reject(Error(input.message)) : pending.resolve() } }
    }
    if (input.type === 'chunk') {
      const file = room.file
      if (!file || file.id !== input.id) return
      if (file.queue.length >= 2 || input.n !== file.next++ || input.done && input.data) throw Error('Invalid direct transfer chunk')
      if (input.data) { const bytes = un64(input.data); file.bytes += bytes.length; if (file.bytes > file.maximum) { bytes.fill(0); throw Error('Received file exceeds its declared size') }; file.queue.push(bytes) }
      if (input.done) file.queue.push(null)
      file.wake?.()
    }
    this.changed()
  }
  async *read(id: string, objectId: string, signal?: AbortSignal): AsyncGenerator<Uint8Array> {
    const room = this.guests.get(id), item = room?.manifest?.objects.find(item => item.id === objectId)
    if (!room?.link || !item || !['ready', 'receiving'].includes(room.status) || room.file) throw Error('This transfer is not ready')
    const file: NonNullable<TransferGuest['file']> = { id: crypto.randomUUID(), queue: [], next: 0, bytes: 0, maximum: item.bytes }
    room.file = file; room.status = 'receiving'; this.changed()
    const abort = () => { file.error = Error('Direct transfer cancelled'); file.wake?.() }
    signal?.addEventListener('abort', abort, { once: true }); let timer: ReturnType<typeof setTimeout> | undefined, n = 0
    try {
      signal?.throwIfAborted(); await room.link.send({ type: 'pull', id: file.id, object: objectId })
      while (true) {
        signal?.throwIfAborted(); if (file.error) throw file.error
        if (!file.queue.length) { await new Promise<void>(resolve => { file.wake = resolve; timer = setTimeout(() => { file.error = Error('Direct transfer timed out'); resolve() }, 30000) }); clearTimeout(timer); file.wake = undefined; continue }
        const chunk = file.queue.shift()!
        if (chunk === null) { if (file.bytes !== item.bytes) throw Error('The received file is incomplete'); return }
        try { yield chunk } finally { chunk.fill(0); await room.link.send({ type: 'chunk-ack', id: file.id, n: n++ }) }
      }
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); for (const bytes of file.queue) bytes?.fill(0); room.file = undefined; void room.link.send({ type: 'cancel', id: file.id }).catch(() => {}) }
  }
  async verify(id: string, signal?: AbortSignal, complete = false) {
    const room = this.guests.get(id)
    if (!room?.link || !['ready', 'receiving'].includes(room.status)) throw Error('Direct transfer disconnected')
    const request = crypto.randomUUID()
    await new Promise<void>((resolve, reject) => {
      const fail = (error: Error) => { clearTimeout(timer); room.pending.delete(request); signal?.removeEventListener('abort', abort); reject(error) }
      const abort = () => fail(Error('Direct transfer cancelled'))
      const timer = setTimeout(() => fail(Error('The sender did not confirm this transfer')), 30000)
      room.pending.set(request, { resolve: () => { signal?.removeEventListener('abort', abort); resolve() }, reject: error => { signal?.removeEventListener('abort', abort); reject(error) }, timer })
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) { abort(); return }
      void room.link!.send({ type: complete ? 'received' : 'verify', id: request }).catch(fail)
    })
    if (complete) { room.status = 'complete'; this.changed() }
  }
  private failGuest(room: TransferGuest, error: unknown) {
    if (room.status === 'complete') return
    room.error = collaborationError(error); room.status = 'disconnected'
    if (room.file) { room.file.error = Error(room.error); room.file.wake?.() }
    for (const pending of room.pending.values()) { clearTimeout(pending.timer); pending.reject(Error(room.error)) }; room.pending.clear(); this.changed()
  }
  private cancelAcks(prefix: string) { for (const [key, pending] of this.acks) if (key.startsWith(prefix + ':')) { clearTimeout(pending.timer); this.acks.delete(key); pending.reject(Error('Direct transfer cancelled')) } }
  stop(id: string) {
    const host = this.hosts.get(id)
    if (host) { this.hosts.delete(id); this.cancelAcks(id); host.transport.close(); void host.source.dispose() }
    const guest = this.guests.get(id)
    if (guest) { this.failGuest(guest, Error('Direct transfer cancelled')); this.guests.delete(id); guest.transport.close() }
    this.changed()
  }
  stopAll = () => { for (const id of [...this.hosts.keys(), ...this.guests.keys()]) this.stop(id) }
}

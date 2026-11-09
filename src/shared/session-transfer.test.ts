import { describe, expect, it } from 'vitest'
import { hashTransferBytes, verifiedTransferBytes, transferPlan, TransferManifestSchema, type TransferManifest } from './session-transfer'
const encoder = new TextEncoder()
async function* content(value: string) { yield encoder.encode(value) }
async function fixture(): Promise<TransferManifest> {
  const digest = await hashTransferBytes(content('root rows'))
  return { version: 1, id: crypto.randomUUID(), lineage: 'a'.repeat(64), sourceDevice: 'device', rootId: 'root', createdAt: Date.now(), sessions: [{ id: 'root', workspaceId: 'root', name: 'Work', revision: 1, directories: [], protected: false }], objects: [{ id: 'rows:root', sessionId: 'root', kind: 'rows', path: 'session.jsonl', name: 'Session rows', mime: 'application/x-ndjson', ...digest, deliverable: false, protected: false }] }
}
describe('direct session transfer integrity and incremental planning', () => {
  it('hashes bounded chunks and clears them', async () => {
    const input = encoder.encode('abc')
    expect(await hashTransferBytes((async function* () { yield input })())).toEqual({ bytes: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' })
    expect(input.every(byte => byte === 0)).toBe(true)
    await expect(hashTransferBytes(content('large'), 2)).rejects.toThrow('size limit')
  })
  it('skips identical bytes even when an object has moved and detects divergent local edits', async () => {
    const manifest = await fixture(), item = manifest.objects[0]
    const plan = transferPlan(manifest, [{ id: item.id, sha256: 'a'.repeat(64), bytes: item.bytes }, { id: 'moved', sha256: item.sha256, bytes: item.bytes }], [{ objectId: item.id, sourceHash: 'b'.repeat(64), localHash: 'b'.repeat(64) }])
    expect(plan.downloadBytes).toBe(0); expect(plan.reuse[0].localId).toBe('moved'); expect(plan.conflicts).toEqual([item.id])
    expect(transferPlan(manifest, [{ id: 'wrong-size', sha256: item.sha256, bytes: item.bytes + 1 }]).download).toHaveLength(1)
  })
  it('rejects tampering/truncation before a staged stream can finish', async () => {
    const manifest = await fixture(), item = manifest.objects[0]
    const drain = async (value: string) => { for await (const _ of verifiedTransferBytes(item, content(value))) {} }
    await drain('root rows'); await expect(drain('bad bytes')).rejects.toThrow('hash'); await expect(drain('short')).rejects.toThrow('hash')
  })
  it('accepts a shared parent workspace and rejects missing parents, traversal and duplicate identities', async () => {
    const manifest = await fixture()
    manifest.sessions.push({ ...manifest.sessions[0], id: 'child', parentId: 'root' })
    manifest.objects.push({ ...manifest.objects[0], id: 'rows:child', sessionId: 'child' })
    expect(TransferManifestSchema.safeParse(manifest).success).toBe(true)
    expect(TransferManifestSchema.safeParse({ ...manifest, objects: [...manifest.objects, manifest.objects[0]] }).success).toBe(false)
    expect(TransferManifestSchema.safeParse({ ...manifest, objects: [{ ...manifest.objects[0], path: '../secret' }] }).success).toBe(false)
    manifest.sessions[1].parentId = 'missing'
    expect(TransferManifestSchema.safeParse(manifest).success).toBe(false)
  })
})

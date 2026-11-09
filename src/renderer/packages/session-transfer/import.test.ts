import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openNodeSessionRowDatabase } from '../../../../packages/chatbox-core/src/persistence/node-sqlite.test-support'
import { SqlSessionRowStore } from '../../../../packages/chatbox-core/src/persistence/session-row-sql'
import { contextSnapshot } from '../../../../packages/chatbox-core/src/persistence/session-context-read.test-support'
import { createSessionMetaRecord } from '@chatbox/core/application/session'
import type { ImageGeneration } from '@shared/types'
import type { MediaRecord } from '@shared/providers/definitions/models/venice/media'
import type { Platform } from '@/platform/interfaces'
const state = vi.hoisted(() => ({ platform: {} as any, vault: undefined as any, identity: undefined as any, media: [] as MediaRecord[], closed: [] as (() => void)[], reloaded: 0 }))
vi.mock('@/platform', () => ({ default: new Proxy({}, { get: (_target, key) => state.platform[key], set: (_target, key, value) => { state.platform[key] = value; return true } }) }))
vi.mock('@/packages/vault/runtime', async original => ({ ...await original<any>(), vaultRuntimeFor: () => state.vault, installedVaultFor: () => state.vault }))
vi.mock('@/packages/collaboration/transport', () => ({ deviceIdentity: async () => state.identity }))
vi.mock('@/packages/venice/service', () => ({ veniceMediaService: {
  list: async () => state.media, isActive: () => false,
  importLocal: async (records: MediaRecord[]) => { state.media.push(...structuredClone(records)) },
  remove: async (id: string) => { state.media = state.media.filter(item => item.id !== id) },
} }))
vi.mock('@/app/renderer-application', () => ({ rendererApplication: {
  generationRuntime: { getGeneratingSessionIds: () => [] },
  sessions: { reloadFromStorage: async () => { state.reloaded++ }, archiveSession: async (id: string) => state.platform.getSessionMetaStorage().update(id, { archivedAt: Date.now() }) },
} }))
vi.mock('@/stores/session/crud', () => ({ deleteSession: async (id: string) => {
  const rows = state.platform.getSessionRowStore(), revision = await rows.getRevision(id)
  if (revision !== null) await rows.deleteRows(id, revision)
  await state.platform.getSessionMetaStorage().delete(id)
} }))
vi.mock('@/packages/session-resources/service', async () => ({
  listSessionResources: async (id: string) => {
    const { sessionFiles } = await import('@/packages/session-resources/files'), index = await sessionFiles.index(id)
    const images = await state.platform.getImageGenerationStorage().getPage(0, 100)
    return { items: [...index.files, ...images.items.filter((image: ImageGeneration) => image.source?.sessionId === id).flatMap((image: ImageGeneration) => image.generatedImages.map((key, n) => ({ id: 'image:' + image.id + ':' + key, recordId: image.id, key, path: 'images/' + image.id + '/' + (n + 1) + '.png', name: 'Image', mime: 'image/png', origin: 'image', deliverable: true }))), ...state.media.filter(item => item.sessionId === id && item.blobKey).map(item => ({ id: 'media:' + item.id, recordId: item.id, key: item.blobKey, path: 'media/' + item.kind + '/' + item.id + '.wav', name: 'Audio', mime: item.mime, origin: 'media', deliverable: true }))], directories: index.directories || [], truncated: false }
  },
  readSessionResource: vi.fn(async () => { throw Error('Unexpected legacy read') }),
}))
import platform from '@/platform'
import { VaultRuntime } from '@/packages/vault/runtime'
import { sessionFiles } from '@/packages/session-resources/files'
import { keyPair } from '@/packages/collaboration/crypto'
import { updateAgentData } from '@/packages/multi-agent/storage'
import { prepareTransfer, portableReferences, type PreparedTransfer } from './snapshot'
import { analyzeTransfer, importTransfer } from './import'
import { startImportJournal, releaseImportJournal, recoverSessionTransfers } from './journal'

async function device() {
  if (typeof window === 'undefined') vi.stubGlobal('window', new EventTarget())
  const database = openNodeSessionRowDatabase(), rows = new SqlSessionRowStore(database)
  state.closed.push(() => database.close()); await rows.initialize()
  const metas = new Map<string, any>(), images = new Map<string, ImageGeneration>(), values = new Map<string, unknown>(), blobs = new Map<string, string>(), envelopes = new Map<string, string>()
  const metadata = { initialize: async () => {}, getById: async (id: string) => metas.get(id) || null, getAllIncludingHidden: async () => [...metas.values()], createMany: async (records: any[]) => { for (const record of records) metas.set(record.id, structuredClone(record)) }, delete: async (id: string) => { metas.delete(id) }, update: async (id: string, patch: any) => { if (!metas.has(id)) throw Error('Missing metadata'); metas.set(id, { ...metas.get(id), ...structuredClone(patch) }) } }
  state.platform = { type: 'desktop', getSessionRowStore: () => rows, getSessionMetaStorage: () => metadata,
    getStoreValue: async (key: string) => values.get(key) ?? null, setStoreValue: async (key: string, value: unknown) => { values.set(key, structuredClone(value)) }, delStoreValue: async (key: string) => { values.delete(key) }, getAllStoreValues: async () => Object.fromEntries(values), setAllStoreValues: async () => {},
    getStoreBlob: async (key: string) => blobs.get(key) || null, setStoreBlob: async (key: string, value: string) => { blobs.set(key, value) }, delStoreBlob: async (key: string) => { blobs.delete(key) }, listStoreBlobKeys: async () => [...blobs.keys()],
    getImageGenerationStorage: () => ({ initialize: async () => {}, create: async (record: ImageGeneration) => { images.set(record.id, structuredClone(record)) }, getById: async (id: string) => images.get(id) || null, getPage: async () => ({ items: [...images.values()], nextCursor: null, total: images.size }), update: async (id: string, patch: any) => { const next = { ...images.get(id)!, ...patch }; images.set(id, next); return next }, delete: async (id: string) => { images.delete(id) } }),
  }
  state.media = []; state.reloaded = 0; state.identity = await keyPair()
  const vault = new VaultRuntime(platform as Platform, { databaseName: 'transfer-' + crypto.randomUUID(), device: { capabilities: async () => ({ encryption: true, biometric: false, name: 'Test device' }), protect: async value => { const id = crypto.randomUUID(); envelopes.set(id, value); return id }, unprotect: async id => { const value = envelopes.get(id); if (!value) throw Error('No key'); return value } } })
  state.vault = vault; vault.install(platform); await vault.available()
  const conversation = async (id = crypto.randomUUID(), settings?: any) => {
    const fixture = contextSnapshot({ id, name: 'Work', settings, messages: [{ id: 'user', role: 'user', contentParts: [{ type: 'text', text: 'Continue this work' }] }, { id: 'assistant', role: 'assistant', contentParts: [{ type: 'tool-call', toolName: 'venice_media', toolCallId: 'audio-call', state: 'result', args: { action: 'show', id: 'voice' }, result: { id: 'voice', kind: 'speech', artifact: { type: 'venice_media', recordId: 'voice' } } }] }] } as any)
    await rows.writeRows(fixture); await metadata.createMany([createSessionMetaRecord(fixture.record, 0, Date.now())]); return id
  }
  return { vault, rows, metas, metadata, images, blobs, conversation }
}
async function wire(prepared: PreparedTransfer) {
  const data = new Map<string, Uint8Array[]>()
  for (const item of prepared.manifest.objects) { const chunks: Uint8Array[] = []; for await (const chunk of prepared.read(item.id)) chunks.push(chunk.slice()); data.set(item.id, chunks) }
  return async function* (id: string) { for (const chunk of data.get(id) || []) yield chunk.slice() }
}
afterEach(() => { for (const close of state.closed.splice(0)) close(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('direct transfer real SQLite rows and encrypted receiver storage', () => {
  it('copies an agent tree, directories, empty files, images and playable media with canonical links', async () => {
    const sender = await device(), root = await sender.conversation(undefined, { multiAgent: { enabled: true, dedicatedIds: ['worker'], nestedDedicatedIds: ['worker'], allowOnDemand: true, concurrency: 3 } }), child = await sender.conversation()
    await updateAgentData('private-agents:runs:' + encodeURIComponent(root), [], () => [{ id: 'run', rootId: root, parentId: root, sessionId: child, workspaceId: root, kind: 'on-demand', depth: 1, title: 'Worker', model: { provider: 'venice', modelId: 'test' }, tools: [], allowOnDemand: false, dedicatedIds: [], status: 'completed', createdAt: 1, updatedAt: 2 }], root)
    await sessionFiles.write(root, 'report.md', new TextEncoder().encode('# Private report'), { deliverable: true }); await sessionFiles.write(root, 'empty.txt', new Uint8Array()); await sessionFiles.mkdir(root, 'notes')
    for (const [key, mime] of [['image-output', 'image/png'], ['audio-output', 'audio/wav']]) await sender.vault.assets.put((async function* () { yield new Uint8Array([1, 2, 3]) })(), { name: key, mime, kind: mime.startsWith('image') ? 'image' : 'audio' }, 'public', key)
    sender.images.set('picture', { id: 'picture', prompt: 'Mountains', model: { provider: 'venice', modelId: 'image-model' }, referenceImages: [], generatedImages: ['image-output'], createdAt: 1, status: 'done', source: { type: 'chatbox_cli', sessionId: root, toolCallId: 'image-call' } })
    state.media = [{ id: 'voice', sessionId: child, kind: 'speech', prompt: 'Hello', model: 'tts', createdAt: 1, status: 'ready', origin: 'https://api.venice.ai', credentialId: 'must-not-transfer', queueId: 'must-not-transfer', blobKey: 'audio-output', mime: 'audio/wav' }]
    const prepared = await prepareTransfer(root, false), read = await wire(prepared)
    expect(prepared.manifest.sessions).toHaveLength(2)
    const receiver = await device(), result = await importTransfer(await analyzeTransfer(prepared.manifest), read, { name: 'Received work' })
    expect(result.sessions).toBe(2); expect(receiver.metas.get(result.rootId).hidden).toBe(false)
    expect([...receiver.metas.values()].filter(meta => meta.hidden)).toHaveLength(1)
    expect((await receiver.rows.readSnapshot(result.rootId))?.record.settings?.multiAgent).toMatchObject({ enabled: false, dedicatedIds: [], nestedDedicatedIds: [] })
    expect((await receiver.rows.readSnapshot(result.rootId))?.record.settings).toMatchObject({ agentFullAccess: false, commandApprovalMode: 'always_ask', workingDirectories: [], localWorkCapabilities: [] })
    expect(new TextDecoder().decode((await sessionFiles.read(result.rootId, 'report.md')).bytes)).toBe('# Private report')
    expect((await sessionFiles.read(result.rootId, 'empty.txt')).bytes.length).toBe(0); expect((await sessionFiles.index(result.rootId)).directories).toContain('notes')
    expect([...receiver.blobs.values()].join('')).not.toContain('Private report')
    const voice = state.media.find(item => item.prompt === 'Hello')!
    expect(voice).toMatchObject({ origin: '', credentialId: '', remoteCleaned: true }); expect(voice.queueId).toBeUndefined(); expect(voice.id).not.toBe('voice')
    expect((await receiver.rows.readSnapshot(voice.sessionId!))?.record.settings?.multiAgentRun).toMatchObject({ rootId: result.rootId, workspaceId: result.rootId })
    const message = (await receiver.rows.readSnapshot(voice.sessionId!))?.rows.messages.find(item => item.messageId === 'assistant')?.message
    expect((message?.contentParts[0] as any).result.artifact.recordId).toBe(voice.id)
    expect([...receiver.images.values()][0].generatedImages[0]).toMatch(/^session-file:/)
    const again = await prepareTransfer(result.rootId, false)
    // Rebuilt history must not duplicate managed file blobs on the next transfer.
    expect(again.manifest.objects.filter(item => item.kind === 'file')).toHaveLength(prepared.manifest.objects.filter(item => item.kind === 'file').length)
    await again.dispose()
  })
  it('reuses identical files and archives the old root only after a successful replacement', async () => {
    const sender = await device(), root = await sender.conversation(); await sessionFiles.write(root, 'report.md', new TextEncoder().encode('unchanged'))
    const prepared = await prepareTransfer(root, false), read = await wire(prepared), receiver = await device()
    const first = await importTransfer(await analyzeTransfer(prepared.manifest), read, { name: 'First copy' })
    const analysis = await analyzeTransfer(prepared.manifest, first.rootId)
    expect(analysis.plan.reuse.some(item => item.incoming.path === 'report.md')).toBe(true)
    const replacement = await importTransfer(analysis, read, { name: 'Continue here', confirmLocalChanges: true })
    expect(replacement.reused).toBeGreaterThan(0); expect(receiver.metas.get(first.rootId).archivedAt).toBeGreaterThan(0); expect(receiver.metas.get(replacement.rootId).name).toBe('Continue here')
  })
  it('rejects tampered input without publishing candidates or damaging the old copy', async () => {
    const sender = await device(), root = await sender.conversation(), prepared = await prepareTransfer(root, false), receiver = await device(), existing = await receiver.conversation()
    const before = [...receiver.metas.keys()]
    await expect(importTransfer(await analyzeTransfer(prepared.manifest), async function* () { yield new TextEncoder().encode('tampered') }, { name: 'Bad copy' })).rejects.toThrow()
    expect([...receiver.metas.keys()]).toEqual(before); expect(await receiver.rows.readExportCommit(existing)).toBeTruthy()
    expect(await receiver.vault.db.getSetting('direct-transfer-journal-v1')).toEqual([])
    expect([...await receiver.vault.db.aliases()].filter(key => key.startsWith('session-file:'))).toHaveLength(0)
  })
  it('requires a protected destination and gives its index and every received file the project key', async () => {
    const sender = await device(), root = await sender.conversation(); await sessionFiles.write(root, 'report.md', new TextEncoder().encode('protected'))
    const prepared = await prepareTransfer(root, false), read = await wire(prepared); prepared.manifest.objects[0].protected = true
    const receiver = await device()
    await expect(importTransfer(await analyzeTransfer(prepared.manifest), read, { name: 'Wrong target' })).rejects.toThrow('protected project')
    await receiver.vault.keys.configure('project:secret', { pin: '123456', biometric: false }); await receiver.vault.db.setSetting('project-access-v1', { secret: { mode: 'pin', scope: 'project:secret' } }); receiver.vault.keys.refresh()
    const result = await importTransfer(await analyzeTransfer(prepared.manifest), read, { name: 'Protected copy', folderId: 'secret' })
    for await (const header of receiver.vault.db.all()) { const info = await receiver.vault.assets.info(header); if (info.sessionId === result.rootId) expect(header.scope).toBe('project:secret') }
  })
  it('recovers a crash before publication and finishes a committed copy after restart', async () => {
    const target = await device(), rootId = crypto.randomUUID(), job = crypto.randomUUID()
    await startImportJournal({ job, rootId, ids: [rootId], committed: false }); await target.metadata.createMany([{ id: rootId, hidden: true }]); releaseImportJournal(job)
    await recoverSessionTransfers(); expect(target.metas.has(rootId)).toBe(false)
    const committed = await target.conversation(), next = crypto.randomUUID()
    await target.metadata.update(committed, { hidden: true }); await startImportJournal({ job: next, rootId: committed, ids: [committed], committed: true }); releaseImportJournal(next)
    await recoverSessionTransfers(); expect(target.metas.get(committed).hidden).toBe(false)
  })
  it('does not bind foreign receiver blobs, and stops reading if source protection changes', async () => {
    expect(portableReferences({ storageKey: 'foreign-device-blob', nested: { rawStorageKey: 'offered' } }, new Map([['offered', 'local-copy']]), true)).toEqual({ storageKey: undefined, nested: { rawStorageKey: 'local-copy' } })
    const sender = await device(), root = await sender.conversation(); await sessionFiles.write(root, 'report.md', new TextEncoder().encode('private'))
    const prepared = await prepareTransfer(root, false), file = (await sessionFiles.list(root))[0]
    await sender.vault.keys.configure('app', { pin: '123456', biometric: false }); await sender.vault.assets.rewrap(file.key, 'app')
    await expect(prepared.assertCurrent()).rejects.toThrow('protection changed')
    await expect(prepared.read(prepared.manifest.objects.find(item => item.kind === 'file')!.id).next()).rejects.toThrow('protection changed')
    await prepared.dispose()
  })
  it('cleans orphaned outgoing snapshots after restart without needing protected plaintext', async () => {
    const target = await device(), job = crypto.randomUUID(), alias = 'private-transfer-stage:' + job + ':orphan'
    await target.vault.assets.put((async function* () { yield new Uint8Array([1, 2]) })(), { name: 'Temporary snapshot', mime: 'application/octet-stream', kind: 'chat', hidden: true }, 'public', alias)
    await recoverSessionTransfers(); expect(await target.vault.assets.header(alias)).toBeNull()
  })
  it('rolls back already published child candidates when the root publication fails', async () => {
    const sender = await device(), root = await sender.conversation(), child = await sender.conversation()
    await updateAgentData('private-agents:runs:' + encodeURIComponent(root), [], () => [{ id: 'run', rootId: root, parentId: root, sessionId: child, workspaceId: child, kind: 'dedicated', depth: 1, title: 'Worker', model: { provider: 'venice', modelId: 'test' }, tools: [], allowOnDemand: false, dedicatedIds: [], status: 'completed', createdAt: 1, updatedAt: 2 }], root)
    const prepared = await prepareTransfer(root, false), read = await wire(prepared), receiver = await device(), existing = await receiver.conversation(), stage = receiver.rows.stageImportRows.bind(receiver.rows)
    vi.spyOn(receiver.rows, 'stageImportRows').mockImplementation(async (record, job) => { const writer = await stage(record, job); if (!record.hidden) writer.publish = async () => { throw Error('Simulated disk failure') }; return writer })
    await expect(importTransfer(await analyzeTransfer(prepared.manifest), read, { name: 'Incomplete copy' })).rejects.toThrow('disk failure')
    expect([...receiver.metas.keys()]).toEqual([existing]); expect(await receiver.rows.listSessionIds()).toEqual([existing])
  })
})

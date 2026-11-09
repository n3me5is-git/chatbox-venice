import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'
import { toBackupSession, toBackupThread, toBackupMessage } from '@chatbox/core/backup-v3'
import type { BackupBusinessRecord } from '@chatbox/core/backup-v3'
import type { AgentRun } from '@shared/multi-agent'
import { TransferManifestSchema, TRANSFER_OBJECT_LIMIT, type TransferManifest, type TransferObject, type TransferCatalog, TransferCatalogSchema } from '@shared/session-transfer'
import { sessionFilePath, type SessionResource } from '@shared/session-resources'
import { rendererApplication } from '@/app/renderer-application'
import { listSessionResources, readSessionResource } from '@/packages/session-resources/service'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import { readAgentData, updateAgentData } from '@/packages/multi-agent/storage'
import { veniceMediaService } from '@/packages/venice/service'
import { deviceIdentity } from '@/packages/collaboration/transport'
import { fingerprint } from '@/packages/collaboration/crypto'
import platform from '@/platform'
import { activeTransferSnapshots, holdTransferLease, forgetTransferLease } from './lifecycle'

export interface TransferReceipt {
  version: 1
  lineage: string
  originalRootId: string
  sourceDevice: string
  localRootId: string
  /** Canonical source IDs -> local session IDs. Message/thread IDs are scoped and retained. */
  sessions: Record<string, string>
  runs: Record<string, string>
  resources: Record<string, string>
  records?: Record<string, string>
  sourceHashes: Record<string, string>
  localHashes: Record<string, string>
}
export const transferReceiptKey = (id: string) => 'private-session-transfer:receipt:' + encodeURIComponent(id)
export interface PreparedTransfer {
  manifest: TransferManifest
  lineage: string
  read(id: string): AsyncGenerator<Uint8Array>
  assertCurrent(): Promise<void>
  dispose(): Promise<void>
  sent(): Promise<void>
}
const encoder = new TextEncoder()
const vault = () => vaultRuntimeFor(platform)
const digest = (value: string) => bytesToHex(sha256(encoder.encode(value)))

/** Rewrite explicit storage references, not arbitrary message text or model IDs. */
export function portableReferences(value: unknown, resources: Map<string, string>, strict = false): unknown {
  if (Array.isArray(value)) return value.map(item => portableReferences(item, resources, strict))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    typeof item === 'string' && ['storageKey', 'rawStorageKey', 'blobKey', 'imageStorageKey'].includes(key)
      ? resources.get(item) || (strict ? undefined : item) : portableReferences(item, resources, strict)]))
}

export function portableRecord(record: BackupBusinessRecord, sessionIds: Map<string, string>, resources: Map<string, string>, runIds = new Map<string, string>(), recordIds = new Map<string, string>(), strict = false): BackupBusinessRecord {
  const value = portableReferences(record, resources, strict) as BackupBusinessRecord
  if (value.type === 'session') {
    value.session.id = sessionIds.get(value.session.id) || value.session.id
    const run = value.session.settings?.multiAgentRun
    if (run) value.session.settings!.multiAgentRun = { ...run, rootId: sessionIds.get(run.rootId) || run.rootId, workspaceId: sessionIds.get(run.workspaceId) || run.workspaceId, runId: runIds.get(run.runId) || run.runId, parentId: sessionIds.get(run.parentId) || runIds.get(run.parentId) || run.parentId }
  } else if (value.type === 'thread') value.thread.sessionId = sessionIds.get(value.thread.sessionId) || value.thread.sessionId
  else if (value.type === 'message') {
    value.message.sessionId = sessionIds.get(value.message.sessionId) || value.message.sessionId
    const remap = (input: unknown): unknown => {
      if (Array.isArray(input)) return input.map(remap)
      if (!input || typeof input !== 'object') return input
      return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, typeof item === 'string' && ['id', 'recordId'].includes(key) ? recordIds.get(item) || item : remap(item)]))
    }
    value.message.message.contentParts = value.message.message.contentParts.map(part => part.type === 'tool-call' && part.toolName === 'venice_media' ? { ...part, args: remap(part.args), result: remap(part.result) } as typeof part : part)
  }
  return value
}

async function* resourceBytes(id: string, item: SessionResource) {
  await vault().projects.assertSession(id)
  const header = item.key && await vault().assets.header(item.key)
  if (header) {
    const info = await vault().assets.info(header)
    if (info.logicalBytes === 0) return
    for await (const chunk of vault().assets.read(item.key!)) { await vault().projects.assertSession(id); yield chunk }
    return
  }
  // Sandbox text files and legacy attachments are already bounded by their resource adapter.
  const content = await readSessionResource(id, item)
  try { for (let at = 0; at < content.bytes.length; at += 65536) { await vault().projects.assertSession(id); yield content.bytes.slice(at, at + 65536) } }
  finally { content.bytes.fill(0) }
}

export async function prepareTransfer(rootId: string, includeProtected: boolean, signal?: AbortSignal, progress?: (objects: number, bytes: number) => void): Promise<PreparedTransfer> {
  await vault().projects.assertSession(rootId)
  if (!await vault().available()) throw Error('Device encryption is unavailable')
  const rows = platform.getSessionRowStore(); await rows.initialize()
  const root = await rows.readExportCommit(rootId)
  if (!root) throw Error('This chat is no longer available')
  if (root.record.settings?.multiAgentRun) throw Error('Send the parent Work chat to include the complete agent tree')
  const receipt = await readAgentData<TransferReceipt | null>(transferReceiptKey(rootId), null)
  const inverseSessions = new Map(Object.entries(receipt?.sessions || {}).map(([canonical, local]) => [local, canonical]))
  const inverseResources = new Map(Object.entries(receipt?.resources || {}).map(([canonical, local]) => [local, canonical]))
  const inverseRuns = new Map(Object.entries(receipt?.runs || {}).map(([canonical, local]) => [local, canonical]))
  const inverseRecords = new Map(Object.entries(receipt?.records || {}).map(([canonical, local]) => [local, canonical]))
  const canonical = (id: string) => inverseSessions.get(id) || id
  const runs = await readAgentData<AgentRun[]>('private-agents:runs:' + encodeURIComponent(rootId), [])
  if (runs.some(run => ['queued', 'running', 'waiting'].includes(run.status))) throw Error('Finish or stop running agents before sending this chat')
  const allIds = [rootId, ...runs.map(run => run.sessionId)]
  const media = (await veniceMediaService.list()).filter(item => item.sessionId && allIds.includes(item.sessionId))
  if (media.some(item => veniceMediaService.isActive(item.id) || ['creating', 'queued'].includes(item.status))) throw Error('Finish or pause media generation before sending this chat')
  if (allIds.length > 65 || new Set(allIds).size !== allIds.length) throw Error('The agent tree is inconsistent or exceeds the transfer limit')
  if (rendererApplication.generationRuntime.getGeneratingSessionIds().some(id => allIds.includes(id))) throw Error('Finish or stop generation before sending this chat')
  const sourceDevice = await fingerprint((await deviceIdentity()).publicKey), job = crypto.randomUUID()
  const lineage = receipt?.lineage || digest(sourceDevice + '\0' + canonical(rootId))
  const manifest: TransferManifest = { version: 1, id: job, lineage, sourceDevice, rootId: canonical(rootId), createdAt: Date.now(), sessions: [], objects: [] }
  const stages = new Map<string, string>(), revisions = new Map<string, number>(), signatures = new Map<string, string>()
  const sourceScopes = new Map<string, string | null>(), sourceRefs = new Map<string, string>(), sessionScopes = new Map<string, string | null>()
  let total = 0, disposed = false
  const scope = await vault().projects.sessionScope(rootId) || 'public'
  const requiredScopes = new Set<string>()
  const catalog: TransferCatalog = { media: [], images: [] }
  const stage = async (details: Omit<TransferObject, 'sha256' | 'bytes'>, source: AsyncIterable<Uint8Array>, objectScope = scope) => {
    if (objectScope !== 'public') requiredScopes.add(objectScope)
    signal?.throwIfAborted(); const hasher = sha256.create(); let length = 0
    async function* content() {
      for await (const chunk of source) {
        try { signal?.throwIfAborted(); length += chunk.length; if (length > TRANSFER_OBJECT_LIMIT) throw Error('Transfer object exceeds the size limit'); hasher.update(chunk); yield chunk }
        finally { chunk.fill(0) }
      }
      if (!length) yield new Uint8Array([0])
    }
    try {
      const ref = await vault().assets.put(content(), { name: 'Temporary encrypted session transfer', mime: details.mime, kind: 'chat', sessionId: rootId, hidden: true }, objectScope, 'private-transfer-stage:' + job + ':' + details.id, signal)
      stages.set(details.id, ref)
      manifest.objects.push({ ...details, bytes: length, sha256: bytesToHex(hasher.digest()) }); total += length
      if (total > 2 * 1024 * 1024 * 1024 || manifest.objects.length > 2048) throw Error('This session tree exceeds the transfer limit')
      progress?.(manifest.objects.length, total)
    } finally { hasher.destroy() }
  }
  const currentSignature = (items: SessionResource[], directories: string[]) => digest(JSON.stringify([directories, items.map(item => [item.id, item.key, item.path, item.bytes, item.updatedAt])]))
  const dispose = async () => { if (disposed) return; disposed = true; await Promise.allSettled([...stages.values()].map(ref => vault().assets.remove(ref))); stages.clear(); activeTransferSnapshots.delete(job); forgetTransferLease(job) }
  const mediaSignature = (items: typeof media) => digest(JSON.stringify(items.map(item => [item.id, item.sessionId, item.status, item.protection, item.protectedRecord, item.blobKey, item.prompt, item.text]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))))
  const originalMedia = mediaSignature(media)
  await holdTransferLease(job); activeTransferSnapshots.add(job)
  try {
    for (const id of allIds) {
      signal?.throwIfAborted(); await vault().projects.assertSession(id)
      const commit = await rows.readExportCommit(id)
      if (!commit) throw Error('A descendant chat is missing; the transfer was cancelled')
      revisions.set(id, commit.revision)
      const resources = await listSessionResources(id, signal)
      if (resources.truncated) throw Error('This chat has too many resources for a complete transfer')
      signatures.set(id, currentSignature(resources.items, resources.directories))
      const run = runs.find(run => run.sessionId === id)
      let parentId: string | undefined
      if (run) {
        if (run.parentId === rootId) parentId = canonical(rootId)
        else { const parent = runs.find(parent => parent.id === run.parentId); if (!parent) throw Error('The agent tree has a missing parent'); parentId = canonical(parent.sessionId) }
      }
      const protectedSession = !!await vault().projects.sessionScope(id)
      sessionScopes.set(id, await vault().projects.sessionScope(id) || null)
      if (protectedSession && !includeProtected) throw Error('This tree contains protected content. Unlock it and explicitly include protected content to send it.')
      manifest.sessions.push({ id: canonical(id), parentId, workspaceId: canonical(run?.workspaceId || id), name: commit.record.name.slice(0, 240), revision: commit.revision, directories: resources.directories, protected: protectedSession })
      const paths = new Set<string>()
      const removed = (await (await import('@/packages/session-resources/files')).sessionFiles.index(id)).removed
      const resourceKeys = new Set([...resources.items.filter(item => item.key).map(item => item.key!), ...removed.filter(key => key.startsWith('key:')).map(key => key.slice(4))])
      const managedKeys = new Set(resources.items.filter(item => item.origin === 'file' && item.key).map(item => item.key!))
      for (const item of resources.items) {
        if (item.origin !== 'file' && item.key && managedKeys.has(item.key)) continue
        let path: string
        try { path = sessionFilePath(item.path) } catch { throw Error('A resource has an unsupported path; rename it before transferring') }
        const header = item.key ? await vault().assets.header(item.key) : null, protectedAsset = !!header && header.scope !== 'public'
        if (protectedAsset && !includeProtected) throw Error('This tree contains protected content. Unlock it and explicitly include protected content to send it.')
        if (paths.has(path)) path = sessionFilePath('copies/' + digest(item.id).slice(0, 12) + '/' + path)
        paths.add(path)
        const objectId = digest(canonical(id) + '\0file\0' + path)
        if (item.key) { sourceScopes.set(item.key, header?.scope || null); sourceRefs.set(objectId, item.key) }
        await stage({ id: objectId, sessionId: canonical(id), kind: 'file', path, name: item.name.slice(0, 240), mime: item.mime, deliverable: !!item.deliverable, protected: protectedAsset || protectedSession, ...(item.key ? { resourceKey: inverseResources.get(item.key) || item.key } : {}), ...(item.messageId ? { messageId: item.messageId } : {}) }, resourceBytes(id, item), protectedAsset ? header!.scope : await vault().projects.sessionScope(id) || 'public')
      }
      const imageIds = new Set(resources.items.filter(item => item.origin === 'image').map(item => item.recordId!))
      for (const imageId of imageIds) {
        const image = await platform.getImageGenerationStorage().getById(imageId)
        if (!image || image.protectedRecord) throw Error('Unlock all generated images before sending this chat')
        catalog.images.push({ id: inverseRecords.get(image.id) || image.id, sessionId: canonical(id), prompt: image.prompt, model: { provider: image.model.provider, modelId: image.model.modelId }, createdAt: image.createdAt, generatedImages: image.generatedImages.map(key => inverseResources.get(key) || key), aspectRatio: image.aspectRatio, toolCallId: image.source?.toolCallId, protected: !!image.protection || protectedSession })
      }
      for (const item of media.filter(item => item.sessionId === id)) {
        if (item.protectedRecord || item.protection && !includeProtected) throw Error('Unlock and include protected content before sending this chat')
        if (item.protection) { await vault().keys.key(item.protection); requiredScopes.add(item.protection) }
        catalog.media.push({ id: inverseRecords.get(item.id) || item.id, sessionId: canonical(id), kind: item.kind, model: item.model, prompt: item.prompt, createdAt: item.createdAt, blobKey: item.blobKey ? inverseResources.get(item.blobKey) || item.blobKey : undefined, mime: item.mime, text: item.text, error: item.error?.slice(0, 2000), status: item.status === 'ready' || item.status === 'error' ? item.status : 'paused', protected: !!item.protection || protectedSession })
      }
      async function* businessRows() {
        yield encoder.encode(JSON.stringify(portableRecord({ type: 'session', session: toBackupSession(commit!.record) }, inverseSessions, inverseResources, inverseRuns, inverseRecords)) + '\n')
        for await (const row of rows.iterateRows({ sessionId: id, expectedRevision: commit!.revision, consistency: 'revision', signal })) {
          // Uploaded originals and their parsed text have distinct storage identities.
          // Both must travel, otherwise continuing a chat can lose its document context.
          if (row.kind === 'message') for (const file of row.message.message.files || []) {
            for (const key of [file.storageKey, file.rawStorageKey]) {
              if (!key || resourceKeys.has(key)) continue
              const path = sessionFilePath('attachments/parsed/' + digest(key).slice(0, 20) + '.txt')
              const header = await vault().assets.header(key), protectedAsset = !!header && header.scope !== 'public'
              if (protectedAsset && !includeProtected) throw Error('This tree contains protected content. Unlock it and explicitly include protected content to send it.')
              const objectId = digest(canonical(id) + '\0file\0' + path); sourceScopes.set(key, header?.scope || null); sourceRefs.set(objectId, key)
              await stage({ id: objectId, sessionId: canonical(id), kind: 'file', path, name: (file.name + '.txt').slice(0, 240), mime: 'text/plain', protected: protectedAsset || protectedSession, deliverable: false, resourceKey: inverseResources.get(key) || key, messageId: row.message.messageId }, resourceBytes(id, { id: 'parsed:' + digest(key), origin: 'attachment', key, name: file.name + '.txt', path, mime: 'text/plain' }), protectedAsset ? header!.scope : await vault().projects.sessionScope(id) || 'public')
              resourceKeys.add(key)
            }
          }
          const record: BackupBusinessRecord = row.kind === 'thread' ? { type: 'thread', thread: toBackupThread(row.thread) } : { type: 'message', message: toBackupMessage(row.message) }
          yield encoder.encode(JSON.stringify(portableRecord(record, inverseSessions, inverseResources, inverseRuns, inverseRecords)) + '\n')
        }
      }
      await stage({ id: 'rows:' + canonical(id), sessionId: canonical(id), kind: 'rows', path: 'session.jsonl', name: 'Conversation rows', mime: 'application/x-ndjson', protected: protectedSession, deliverable: false }, businessRows(), await vault().projects.sessionScope(id) || 'public')
    }
    if (runs.length) {
      const canonicalRuns = runs.map(run => ({ ...run, id: inverseRuns.get(run.id) || run.id, rootId: canonical(run.rootId), sessionId: canonical(run.sessionId), workspaceId: canonical(run.workspaceId), parentId: run.parentId === rootId ? canonical(rootId) : inverseRuns.get(run.parentId) || run.parentId }))
      await stage({ id: 'agents:' + canonical(rootId), sessionId: canonical(rootId), kind: 'agents', path: 'agents.json', name: 'Agent tree', mime: 'application/json', protected: scope !== 'public', deliverable: false }, (async function* () { yield encoder.encode(JSON.stringify(canonicalRuns)) })())
    }
    if (catalog.media.length || catalog.images.length) {
      TransferCatalogSchema.parse(catalog)
      await stage({ id: 'catalog:' + canonical(rootId), sessionId: canonical(rootId), kind: 'catalog', path: 'media.json', name: 'Generated media catalog', mime: 'application/json', protected: catalog.media.some(item => item.protected) || catalog.images.some(item => item.protected), deliverable: false }, (async function* () { yield encoder.encode(JSON.stringify(catalog)) })(), [...requiredScopes][0] || scope)
    }
    TransferManifestSchema.parse(manifest)
    const assertCurrent = async () => {
      if (disposed) throw Error('This transfer is no longer available')
      for (const [key, scope] of sourceScopes) if (((await vault().assets.header(key))?.scope || null) !== scope) throw Error('Content protection changed during the transfer. Prepare it again.')
      if (mediaSignature((await veniceMediaService.list()).filter(item => item.sessionId && allIds.includes(item.sessionId))) !== originalMedia) throw Error('The source files changed while preparing the transfer. Prepare it again.')
      for (const [id, revision] of revisions) {
        await vault().projects.assertSession(id)
        if ((await vault().projects.sessionScope(id) || null) !== sessionScopes.get(id)) throw Error('Content protection changed during the transfer. Prepare it again.')
        if (await rows.getRevision(id) !== revision) throw Error('The source chat changed while preparing the transfer. Prepare it again.')
        const current = await listSessionResources(id, signal)
        if (current.truncated || currentSignature(current.items, current.directories) !== signatures.get(id)) throw Error('The source files changed while preparing the transfer. Prepare it again.')
      }
    }
    await assertCurrent()
    return { manifest, lineage, assertCurrent, dispose, async sent() {
      await assertCurrent()
      const hashes = Object.fromEntries(manifest.objects.map(item => [item.id, item.sha256]))
      const next: TransferReceipt = { version: 1, lineage, originalRootId: canonical(rootId), sourceDevice, localRootId: rootId, sessions: Object.fromEntries(allIds.map(id => [canonical(id), id])), runs: Object.fromEntries(runs.map(run => [inverseRuns.get(run.id) || run.id, run.id])), resources: Object.fromEntries(manifest.objects.filter(item => item.resourceKey).map(item => [item.resourceKey!, receipt?.resources[item.resourceKey!] || item.resourceKey!])), records: Object.fromEntries([...catalog.media, ...catalog.images].map(item => [item.id, receipt?.records?.[item.id] || item.id])), sourceHashes: hashes, localHashes: hashes }
      await updateAgentData(transferReceiptKey(rootId), null, () => next, rootId)
    }, async *read(id: string) {
      if (disposed) throw Error('This transfer is no longer available')
      const item = manifest.objects.find(item => item.id === id), ref = stages.get(id)
      if (!item || !ref) throw Error('This file is outside the offered transfer')
      await vault().projects.assertSession(rootId)
      for (const protectedScope of requiredScopes) await vault().keys.key(protectedScope)
      if (item.bytes) for await (const chunk of vault().assets.read(ref)) {
        signal?.throwIfAborted(); await vault().projects.assertSession(rootId)
        const original = sourceRefs.get(id)
        if (original && ((await vault().assets.header(original))?.scope || null) !== sourceScopes.get(original)) { chunk.fill(0); throw Error('Content protection changed during the transfer. Prepare it again.') }
        yield chunk
      }
    } }
  } catch (error) { await dispose(); throw error }
}

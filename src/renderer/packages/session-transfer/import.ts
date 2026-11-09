import { parseBackupRecord, settleBackupRecord, type BackupBusinessRecord } from '@chatbox/core/backup-v3'
import { createSessionMetaRecord } from '@chatbox/core/application/session'
import type { SessionRowImportWriter } from '@chatbox/core/ports'
import type { SessionRecordV2 } from '@chatbox/core/session/session-tree'
import { type TransferManifest, type TransferObject, TransferManifestSchema, TransferCatalogSchema, transferPlan, verifiedTransferBytes } from '@shared/session-transfer'
import { z } from 'zod'
import { DedicatedAgentSchema } from '@shared/multi-agent'
import type { MediaRecord } from '@shared/providers/definitions/models/venice/media'
import { veniceMediaService } from '@/packages/venice/service'
import type { AgentRun } from '@shared/multi-agent'
import type { SessionFile } from '@shared/session-resources'
import { rendererApplication } from '@/app/renderer-application'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import { readAgentData, updateAgentData } from '@/packages/multi-agent/storage'
import { sessionFiles, resourcesChanged } from '@/packages/session-resources/files'
import platform from '@/platform'
import { portableRecord, prepareTransfer, transferReceiptKey, type PreparedTransfer, type TransferReceipt } from './snapshot'
import { startImportJournal, commitImportJournal, finishImportJournal, releaseImportJournal, recoverSessionTransfers } from './journal'

const vault = () => vaultRuntimeFor(platform)
export interface TransferAnalysis {
  manifest: TransferManifest
  local?: PreparedTransfer
  existingId?: string
  plan: ReturnType<typeof transferPlan>
  receipt?: TransferReceipt
}
export async function analyzeTransfer(value: unknown, existingId?: string, signal?: AbortSignal): Promise<TransferAnalysis> {
  const manifest = TransferManifestSchema.parse(value)
  let local: PreparedTransfer | undefined
  try {
    let receipt: TransferReceipt | undefined
    if (existingId) {
      local = await prepareTransfer(existingId, true, signal)
      if (local.lineage !== manifest.lineage) throw Error('This local chat has a different origin. Import a new copy instead.')
      receipt = await readAgentData<TransferReceipt | undefined>(transferReceiptKey(existingId), undefined)
    }
    const baseline = Object.entries(receipt?.sourceHashes || {}).map(([objectId, sourceHash]) => ({ objectId, sourceHash, localHash: receipt?.localHashes[objectId] || sourceHash }))
    return { manifest, local, existingId, receipt, plan: transferPlan(manifest, local?.manifest.objects || [], baseline) }
  } catch (error) { await local?.dispose(); throw error }
}

async function* lines(source: AsyncIterable<Uint8Array>, signal?: AbortSignal) {
  const decoder = new TextDecoder('utf-8', { fatal: true }); let pending = ''
  for await (const bytes of source) {
    try { signal?.throwIfAborted(); pending += decoder.decode(bytes, { stream: true }) } finally { bytes.fill(0) }
    let at: number
    while ((at = pending.indexOf('\n')) >= 0) {
      if (at > 16 * 1024 * 1024) throw Error('A transferred conversation row exceeds the size limit')
      yield pending.slice(0, at); pending = pending.slice(at + 1)
    }
    if (pending.length > 16 * 1024 * 1024) throw Error('A transferred conversation row exceeds the size limit')
  }
  pending += decoder.decode()
  if (pending) throw Error('The transferred conversation is incomplete')
}
async function jsonObject(source: AsyncIterable<Uint8Array>, signal?: AbortSignal): Promise<unknown> {
  const chunks: Uint8Array[] = []; let size = 0
  try {
    for await (const bytes of source) { signal?.throwIfAborted(); size += bytes.length; if (size > 8 * 1024 * 1024) { bytes.fill(0); throw Error('Transferred agent metadata exceeds the size limit') }; chunks.push(bytes) }
    const bytes = new Uint8Array(size); let at = 0
    try { for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length }; return JSON.parse(new TextDecoder().decode(bytes)) }
    finally { bytes.fill(0) }
  } finally { for (const chunk of chunks) chunk.fill(0) }
}

/** New target identities keep the previous tree intact until the entire received tree is usable. */
export async function importTransfer(analysis: TransferAnalysis, read: (id: string) => AsyncIterable<Uint8Array>, options: {
  name: string; folderId?: string; confirmLocalChanges?: boolean; signal?: AbortSignal
  progress?: (completed: number, total: number, downloaded: number, reused: number) => void
  verifySource?: () => Promise<void>
}) {
  const { manifest, plan, local, existingId } = analysis, { signal } = options
  TransferManifestSchema.parse(manifest); signal?.throwIfAborted(); await vault().projects.assertFolder(options.folderId)
  if (!options.name.trim()) throw Error('Enter a name for the received chat')
  if (plan.locallyChanged.length && !options.confirmLocalChanges) throw Error('The local copy changed. Confirm replacement or import a new copy.')
  const targetScope = await vault().projects.folderScope(options.folderId) || 'public'
  if ((manifest.sessions.some(item => item.protected) || manifest.objects.some(item => item.protected)) && targetScope === 'public') throw Error('Choose an unlocked protected project for this protected transfer')
  if (!await vault().available()) throw Error('Device encryption is unavailable')
  const rows = platform.getSessionRowStore(), metadata = platform.getSessionMetaStorage(); await rows.initialize(); await metadata.initialize()
  const sessionMap = new Map(manifest.sessions.map(item => [item.id, crypto.randomUUID()])), rootId = sessionMap.get(manifest.rootId)!
  const resourceMap = new Map<string, string>(), runMap = new Map<string, string>(), recordMap = new Map<string, string>(), stages = new Map<string, { ref: string; alias: string }>()
  const adopted = new Map<string, SessionFile[]>(), writers: SessionRowImportWriter[] = []
  const sourceHashes = Object.fromEntries(manifest.objects.map(item => [item.id, item.sha256]))
  const job = crypto.randomUUID(), reuse = new Map(plan.reuse.map(item => [item.incoming.id, item.localId]))
  let downloaded = 0, reused = 0, complete = false, warning = ''
  const readStaged = async function* (item: TransferObject) {
    const stage = stages.get(item.id); if (!stage) throw Error('A staged transfer object is missing')
    if (item.bytes) yield* vault().assets.read(stage.ref)
  }
  try {
    for (const id of sessionMap.values()) if (await rows.getRevision(id) !== null) throw Error('The destination identity already exists')
    await startImportJournal({ job, rootId, ids: [...sessionMap.values()], folderId: options.folderId, committed: false })
    // Install hidden metadata first: private indices must inherit the receiving project key.
    await metadata.createMany(manifest.sessions.map(node => ({ id: sessionMap.get(node.id)!, name: node.name, folderId: options.folderId, hidden: true, type: 'chat' as const, createdAt: Date.now(), sortOrder: -Date.now() })))
    // Everything is encrypted, hidden and verified before conversation rows become visible.
    for (const item of manifest.objects) {
      signal?.throwIfAborted(); await vault().projects.assertFolder(options.folderId)
      const node = manifest.sessions.find(node => node.id === item.sessionId)!, workspaceId = sessionMap.get(node.workspaceId)!
      const alias = item.kind === 'file' ? 'session-file:' + encodeURIComponent(workspaceId) + ':' + crypto.randomUUID() : 'private-transfer-stage:' + job + ':' + item.id
      const reusedId = reuse.get(item.id), source = reusedId && local ? local.read(reusedId) : read(item.id)
      async function* bytes() { yield* verifiedTransferBytes(item, source, signal); if (!item.bytes) yield new Uint8Array([0]) }
      const ref = await vault().assets.put(bytes(), { name: item.name, mime: item.mime, kind: item.kind === 'file' ? item.mime.startsWith('image/') ? 'image' : item.mime.startsWith('audio/') ? 'audio' : item.mime.startsWith('video/') ? 'video' : 'document' : 'chat', sessionId: workspaceId, resourcePath: item.kind === 'file' ? item.path : undefined, hidden: true, deliverable: item.kind === 'file' && item.deliverable, logicalBytes: item.bytes }, targetScope, alias, signal)
      stages.set(item.id, { ref, alias })
      if (item.resourceKey) { const previous = resourceMap.get(item.resourceKey); if (previous && previous !== alias) { /* One source blob may be referenced by multiple relative paths. */ } else resourceMap.set(item.resourceKey, alias) }
      if (reusedId) reused += item.bytes; else downloaded += item.bytes
      options.progress?.(stages.size, manifest.objects.length, downloaded, reused)
      if (item.kind === 'file') {
        const list = adopted.get(workspaceId) || []
        if (list.some(file => file.path === item.path)) throw Error('Two transferred resources collide in a shared workspace')
        list.push({ id: crypto.randomUUID(), origin: 'file', key: alias, path: item.path, name: item.name, mime: item.mime, bytes: item.bytes, deliverable: item.deliverable }); adopted.set(workspaceId, list)
      }
    }
    const agentObject = manifest.objects.find(item => item.kind === 'agents'), agents = agentObject ? await jsonObject(readStaged(agentObject), signal) : []
    if (!Array.isArray(agents) || agents.length > 64) throw Error('Invalid transferred agent tree')
    for (const run of agents) { if (!run || typeof run.id !== 'string' || runMap.has(run.id)) throw Error('Invalid transferred agent identity'); runMap.set(run.id, crypto.randomUUID()) }
    const importedRuns: AgentRun[] = agents.map((run: AgentRun) => {
      z.object({ id: z.string(), rootId: z.string(), sessionId: z.string(), workspaceId: z.string(), parentId: z.string(), depth: z.number().int().min(1).max(3), kind: z.enum(['on-demand', 'dedicated']), title: z.string().max(200), model: z.object({ provider: z.string().max(200), modelId: z.string().max(200) }), tools: z.array(z.string().max(200)).max(200), dedicatedIds: z.array(z.string()).max(100), allowOnDemand: z.boolean(), status: z.enum(['completed', 'failed', 'cancelled', 'interrupted']), createdAt: z.number().finite(), updatedAt: z.number().finite(), preset: DedicatedAgentSchema.optional(), error: z.string().max(2000).optional() }).strict().parse(run)
      const sessionId = sessionMap.get(run.sessionId), workspaceId = sessionMap.get(run.workspaceId), parentId = sessionMap.get(run.parentId) || runMap.get(run.parentId)
      if (!sessionId || !workspaceId || !parentId || run.rootId !== manifest.rootId) throw Error('A transferred agent points outside the offered session tree')
      const node = manifest.sessions.find(node => node.id === run.sessionId), parentSession = agents.find((parent: AgentRun) => parent.id === run.parentId)?.sessionId || run.parentId
      if (!node || node.id === manifest.rootId || node.parentId !== parentSession || node.workspaceId !== run.workspaceId) throw Error('Transferred agent ancestry does not match the session tree')
      return { ...run, id: runMap.get(run.id)!, rootId, sessionId, workspaceId, parentId, status: ['queued', 'running', 'waiting'].includes(run.status) ? 'interrupted' : run.status }
    })
    if (new Set(importedRuns.map(run => run.sessionId)).size !== manifest.sessions.length - 1) throw Error('The transferred agent tree is incomplete')
    const catalogObject = manifest.objects.find(item => item.kind === 'catalog')
    const catalog = TransferCatalogSchema.parse(catalogObject ? await jsonObject(readStaged(catalogObject), signal) : { media: [], images: [] })
    for (const item of [...catalog.media, ...catalog.images]) {
      if (!sessionMap.has(item.sessionId) || recordMap.has(item.id)) throw Error('Invalid transferred media owner or identity')
      recordMap.set(item.id, crypto.randomUUID())
    }
    const resource = (key: string) => { const mapped = resourceMap.get(key); if (!mapped) throw Error('A generated media file is missing from the transfer'); return mapped }
    for (const item of catalog.media) if (item.blobKey) resource(item.blobKey)
    for (const item of catalog.images) for (const key of item.generatedImages) resource(key)
    const stagedSessions: Array<{ id: string; record: SessionRecordV2; writer: SessionRowImportWriter }> = []
    for (const node of manifest.sessions) {
      const object = manifest.objects.find(item => item.kind === 'rows' && item.sessionId === node.id)!, targetId = sessionMap.get(node.id)!
      let writer: SessionRowImportWriter | undefined, record: SessionRecordV2 | undefined, count = 0
      for await (const line of lines(readStaged(object), signal)) {
        const parsed = parseBackupRecord(JSON.parse(line))
        if (!['session', 'thread', 'message'].includes(parsed.type)) throw Error('A direct transfer may contain only conversation rows')
        const entry = portableRecord(settleBackupRecord(parsed as BackupBusinessRecord), sessionMap, resourceMap, runMap, recordMap)
        if (entry.type === 'session') {
          if (writer || entry.session.id !== targetId) throw Error('Transferred conversation identity mismatch')
          record = { ...entry.session, id: targetId, name: node.id === manifest.rootId ? options.name.trim().slice(0, 240) : node.name, hidden: node.id !== manifest.rootId, folderId: options.folderId, archivedAt: undefined, storageFormat: 'rows', rowFormatVersion: 3, rowAuthority: 1 }
          if (record.settings) record.settings = { ...record.settings, multiAgent: record.settings.multiAgent ? { ...record.settings.multiAgent, enabled: false, dedicatedIds: [], nestedDedicatedIds: [] } : undefined }
          if (!rows.stageImportRows) throw Error('Conversation import is unavailable')
          writer = await rows.stageImportRows(record, job); writers.push(writer)
        } else if (entry.type === 'thread') {
          if (!writer || entry.thread.sessionId !== targetId) throw Error('Transferred thread is outside its conversation')
          await writer.appendRows([{ kind: 'thread', thread: { ...entry.thread, activeLeafMessageId: null } }])
        } else if (entry.type === 'message') {
          if (!writer || entry.message.sessionId !== targetId || ++count > 200000) throw Error('Transferred message is outside its conversation or exceeds the limit')
          await writer.appendRows([{ kind: 'message', message: { ...entry.message, status: 'settled' } }])
        }
      }
      if (!writer || !record) throw Error('Transferred conversation rows are missing')
      const result = await writer.prepare(issue => { if (issue.action === 'skipped') throw Error('A transferred conversation row is invalid') })
      if (result?.skipSession) throw Error('The transferred conversation could not be restored')
      stagedSessions.push({ id: targetId, record, writer })
    }
    await local?.assertCurrent(); await options.verifySource?.(); signal?.throwIfAborted()
    for (const [id, files] of adopted) {
      await sessionFiles.adopt(id, files, { transferredMedia: true }); await sessionFiles.tools(id, false)
    }
    for (const node of manifest.sessions) for (const directory of node.directories) await sessionFiles.mkdir(sessionMap.get(node.workspaceId)!, directory)
    if (importedRuns.length) await updateAgentData<AgentRun[]>('private-agents:runs:' + encodeURIComponent(rootId), [], () => importedRuns, rootId)
    // The root publishes last. Replacement never mutates the old tree in place.
    stagedSessions.sort((a, b) => Number(a.id === rootId) - Number(b.id === rootId))
    for (const session of stagedSessions) { signal?.throwIfAborted(); await vault().projects.assertFolder(options.folderId); await session.writer.publish(); await metadata.update(session.id, { ...createSessionMetaRecord(session.record, -Date.now(), Date.now()), hidden: true }) }
    const protection = targetScope === 'public' ? undefined : targetScope
    await veniceMediaService.importLocal(catalog.media.map((item): MediaRecord => ({ id: recordMap.get(item.id)!, sessionId: sessionMap.get(item.sessionId)!, kind: item.kind, model: item.model, prompt: item.prompt, createdAt: item.createdAt, mime: item.mime, text: item.text, blobKey: item.blobKey ? resource(item.blobKey) : undefined, status: item.status === 'paused' ? 'error' : item.status, error: item.status === 'paused' ? 'This paused generation was copied without its remote queue. Start a new generation explicitly to continue.' : item.error, origin: '', credentialId: '', remoteCleaned: true, protection })))
    const images = platform.getImageGenerationStorage(); await images.initialize()
    for (const item of catalog.images) await images.create({ id: recordMap.get(item.id)!, prompt: item.prompt, model: item.model, createdAt: item.createdAt, generatedImages: item.generatedImages.map(resource), referenceImages: [], status: 'done', aspectRatio: item.aspectRatio, protection, source: { type: 'chatbox_cli', sessionId: sessionMap.get(item.sessionId)!, toolCallId: item.toolCallId || 'transfer-' + recordMap.get(item.id)! } })
    const receipt: TransferReceipt = { version: 1, lineage: manifest.lineage, originalRootId: manifest.rootId, sourceDevice: manifest.sourceDevice, localRootId: rootId, sessions: Object.fromEntries(sessionMap), runs: Object.fromEntries(runMap), resources: Object.fromEntries(resourceMap), records: Object.fromEntries(recordMap), sourceHashes, localHashes: {} }
    await updateAgentData<TransferReceipt | null>(transferReceiptKey(rootId), null, () => receipt, rootId)
    const fresh = await prepareTransfer(rootId, true, signal)
    try { receipt.localHashes = Object.fromEntries(fresh.manifest.objects.map(item => [item.id, item.sha256])); await updateAgentData<TransferReceipt | null>(transferReceiptKey(rootId), null, () => receipt, rootId) } finally { await fresh.dispose() }
    await commitImportJournal(job); complete = true
    await metadata.update(rootId, { hidden: false })
    for (const item of manifest.objects) if (item.kind === 'file') {
      const stage = stages.get(item.id)!, header = await vault().assets.header(stage.ref)
      if (!header) throw Error('A received file disappeared before publication')
      await vault().assets.describe(stage.ref, { ...await vault().assets.info(header), hidden: false, deliverable: item.deliverable })
    }
    await finishImportJournal(job)
    await rendererApplication.sessions.reloadFromStorage()
    if (existingId) {
      try { await local?.assertCurrent(); await rendererApplication.sessions.archiveSession(existingId) }
      catch { warning = 'The received copy is ready. The previous chat changed or could not be archived, so both copies were kept.' }
    }
    for (const id of sessionMap.values()) resourcesChanged(id)
    return { rootId, downloaded, reused, warning, sessions: sessionMap.size }
  } catch (error) {
    // Durable recovery also removes metadata/index writes made before row publication.
    releaseImportJournal(job)
    if (!complete) { for (const stage of stages.values()) await vault().assets.remove(stage.ref).catch(() => {}); await recoverSessionTransfers() }
    throw error
  } finally {
    for (const writer of writers) await writer.dispose().catch(() => {})
    for (const item of manifest.objects) if (item.kind !== 'file') { const stage = stages.get(item.id); if (stage) await vault().assets.remove(stage.ref).catch(() => {}) }
    await local?.dispose()
    releaseImportJournal(job)
  }
}

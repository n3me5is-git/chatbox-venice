import { z } from 'zod'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'
import { sessionFilePath } from './session-resources'

export const TRANSFER_OBJECT_LIMIT = 128 * 1024 * 1024
export const TRANSFER_TOTAL_LIMIT = 2 * 1024 * 1024 * 1024
const id = z.string().min(1).max(200)
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const relativePath = z.string().max(240).refine(value => { try { sessionFilePath(value); return true } catch { return false } }, 'Invalid transfer file path')
export const TransferObjectSchema = z.object({
  id, sessionId: id, kind: z.enum(['rows', 'file', 'agents', 'catalog']), path: relativePath,
  name: z.string().min(1).max(240), mime: z.string().min(1).max(180),
  bytes: z.number().int().safe().min(0).max(TRANSFER_OBJECT_LIMIT), sha256: hash,
  deliverable: z.boolean().default(false), protected: z.boolean().default(false),
  resourceKey: z.string().max(4096).optional(), messageId: id.optional(),
}).strict()
export type TransferObject = z.infer<typeof TransferObjectSchema>
export const TransferSessionSchema = z.object({
  id, parentId: id.optional(), workspaceId: id, name: z.string().min(1).max(240),
  revision: z.number().int().safe().nonnegative(), directories: z.array(relativePath).max(2048),
  protected: z.boolean(),
}).strict()
export const TransferManifestSchema = z.object({
  version: z.literal(1), id: z.string().uuid(), lineage: hash, sourceDevice: z.string().min(1).max(100), rootId: id,
  createdAt: z.number().int().safe().positive(), sessions: z.array(TransferSessionSchema).min(1).max(65),
  objects: z.array(TransferObjectSchema).max(2048),
}).strict().superRefine((manifest, context) => {
  const sessions = new Map(manifest.sessions.map(item => [item.id, item]))
  const fail = (message: string) => context.addIssue({ code: 'custom', message })
  if (sessions.size !== manifest.sessions.length || !sessions.has(manifest.rootId)) fail('Invalid transfer session identities')
  if (sessions.get(manifest.rootId)?.parentId) fail('The transfer root must not have a parent')
  const objects = new Set<string>(), paths = new Set<string>()
  let total = 0
  for (const item of manifest.objects) {
    if (!sessions.has(item.sessionId) || objects.has(item.id)) fail('Invalid transfer object identity')
    const path = JSON.stringify([item.sessionId, item.kind, item.path])
    if (paths.has(path)) fail('Duplicate transfer path')
    objects.add(item.id); paths.add(path); total += item.bytes
  }
  if (total > TRANSFER_TOTAL_LIMIT) fail('The transfer exceeds the size limit')
  for (const session of manifest.sessions) {
    let node: typeof session | undefined = session, depth = 0
    const visited = new Set<string>()
    while (node?.parentId) {
      if (visited.has(node.id) || ++depth > 3) { fail('Invalid transfer descendant tree'); break }
      visited.add(node.id); node = sessions.get(node.parentId)
      if (!node) fail('Missing transfer parent')
    }
    if (node && node.id !== manifest.rootId) fail('Transfer session is outside the selected tree')
    let workspace: typeof session | undefined = session
    const ancestry = new Set<string>()
    while (workspace && !ancestry.has(workspace.id)) { ancestry.add(workspace.id); workspace = workspace.parentId ? sessions.get(workspace.parentId) : undefined }
    if (!ancestry.has(session.workspaceId)) fail('Transfer workspace is outside its ancestor chain')
    if (manifest.objects.filter(item => item.kind === 'rows' && item.sessionId === session.id).length !== 1) fail('Transfer conversation rows are missing or duplicated')
  }
  for (const kind of ['agents', 'catalog']) if (manifest.objects.filter(item => item.kind === kind).length > 1 || manifest.objects.some(item => item.kind === kind && item.sessionId !== manifest.rootId)) fail('Invalid transfer metadata owner')
})
export type TransferManifest = z.infer<typeof TransferManifestSchema>
export interface TransferBaseline { objectId: string; sourceHash: string; localHash: string }
export interface LocalTransferObject { id: string; sha256: string; bytes: number }

const Media = z.object({ id, sessionId: id, kind: z.enum(['speech', 'transcription', 'video', 'music', 'sound-effects', 'voice-conversion']), model: z.string().max(200), prompt: z.string().max(200000), createdAt: z.number().finite(), blobKey: z.string().max(4096).optional(), mime: z.string().max(180).optional(), text: z.string().max(2 * 1024 * 1024).optional(), error: z.string().max(2000).optional(), status: z.enum(['ready', 'error', 'paused']), protected: z.boolean() })
const Image = z.object({ id, sessionId: id, prompt: z.string().max(200000), model: z.object({ provider: z.string().max(200), modelId: z.string().max(200) }), createdAt: z.number().finite(), generatedImages: z.array(z.string().max(4096)).max(100), aspectRatio: z.string().max(50).optional(), toolCallId: id.optional(), protected: z.boolean() })
export const TransferCatalogSchema = z.object({ media: z.array(Media).max(2048), images: z.array(Image).max(2048) }).strict()
export type TransferCatalog = z.infer<typeof TransferCatalogSchema>

/** Hashing is an optimization and integrity check, never a substitute for peer authentication. */
export async function hashTransferBytes(source: AsyncIterable<Uint8Array>, maximum = TRANSFER_OBJECT_LIMIT, signal?: AbortSignal) {
  const digest = sha256.create(); let bytes = 0
  try {
    for await (const chunk of source) {
      try { signal?.throwIfAborted(); bytes += chunk.length; if (bytes > maximum) throw Error('Transfer object exceeds the size limit'); digest.update(chunk) }
      finally { chunk.fill(0) }
    }
    signal?.throwIfAborted(); return { bytes, sha256: bytesToHex(digest.digest()) }
  } finally { digest.destroy() }
}

export function transferPlan(manifest: TransferManifest, local: LocalTransferObject[], baseline: TransferBaseline[] = []) {
  TransferManifestSchema.parse(manifest)
  const current = new Map(local.map(item => [item.id, item])), previous = new Map(baseline.map(item => [item.objectId, item]))
  const reusable = new Map<string, LocalTransferObject>()
  for (const item of local) reusable.set(item.sha256 + ':' + item.bytes, item)
  const reuse: Array<{ incoming: TransferObject; localId: string }> = [], download: TransferObject[] = []
  const locallyChanged: string[] = [], conflicts: string[] = []
  for (const item of manifest.objects) {
    const old = previous.get(item.id), present = current.get(item.id), same = reusable.get(item.sha256 + ':' + item.bytes)
    if (old && (!present || present.sha256 !== old.localHash)) {
      locallyChanged.push(item.id)
      if (item.sha256 !== old.sourceHash) conflicts.push(item.id)
    }
    if (same) reuse.push({ incoming: item, localId: same.id }); else download.push(item)
  }
  const offered = new Set(manifest.objects.map(item => item.id))
  for (const old of baseline) if (!offered.has(old.objectId)) {
    const present = current.get(old.objectId)
    if (present && present.sha256 !== old.localHash) { locallyChanged.push(old.objectId); conflicts.push(old.objectId) }
  }
  return { reuse, download, locallyChanged, conflicts, downloadBytes: download.reduce((sum, item) => sum + item.bytes, 0), reusedBytes: reuse.reduce((sum, item) => sum + item.incoming.bytes, 0) }
}

/** Verify while streaming into an unpublished encrypted candidate; never buffer a whole library. */
export async function* verifiedTransferBytes(item: Pick<TransferObject, 'bytes' | 'sha256'>, source: AsyncIterable<Uint8Array>, signal?: AbortSignal): AsyncGenerator<Uint8Array> {
  const digest = sha256.create(); let bytes = 0
  try {
    for await (const chunk of source) {
      try { signal?.throwIfAborted(); bytes += chunk.length; if (bytes > item.bytes || bytes > TRANSFER_OBJECT_LIMIT) throw Error('Received file size does not match the transfer manifest'); digest.update(chunk); yield chunk }
      finally { chunk.fill(0) }
    }
    signal?.throwIfAborted()
    if (bytes !== item.bytes || bytesToHex(digest.digest()) !== item.sha256) throw Error('Received file hash does not match the transfer manifest')
  } finally { digest.destroy() }
}

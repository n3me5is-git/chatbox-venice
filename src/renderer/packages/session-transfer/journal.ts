import { z } from 'zod'
import { sessionImportCandidateId } from '@chatbox/core/ports'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import { deleteSession } from '@/stores/session/crud'
import platform from '@/platform'
import { activeTransferSnapshots, holdTransferLease, releaseTransferLease, forgetTransferLease, withIdleTransfer } from './lifecycle'
const key = 'direct-transfer-journal-v1'
const Entry = z.object({ job: z.string().uuid(), rootId: z.string().uuid(), ids: z.array(z.string().uuid()).max(65), folderId: z.string().optional(), committed: z.boolean(), createdAt: z.number().optional() })
type Entry = z.infer<typeof Entry>
const active = new Set<string>()
let chain: Promise<unknown> = Promise.resolve()
const vault = () => vaultRuntimeFor(platform)
async function update(change: (entries: Entry[]) => Entry[]) {
  const work = chain.catch(() => {}).then(async () => {
    for (let attempt = 0; attempt < 16; attempt++) {
      const previous = await vault().db.getSetting<Entry[]>(key), entries = z.array(Entry).max(16).parse(previous || [])
      const next = z.array(Entry).max(16).parse(change(entries))
      if (await vault().db.setSettingIfUnchanged(key, previous, next)) return
    }
    throw Error('Transfer storage is busy. Try again.')
  }); chain = work; await work
}
export async function startImportJournal(entry: Entry) {
  Entry.parse(entry); await holdTransferLease(entry.job); active.add(entry.job)
  try { await update(entries => [...entries, { ...entry, createdAt: Date.now() }]) } catch (error) { active.delete(entry.job); forgetTransferLease(entry.job); throw error }
}
export async function commitImportJournal(job: string) { await update(entries => entries.map(entry => entry.job === job ? { ...entry, committed: true } : entry)) }
export async function finishImportJournal(job: string) { await update(entries => entries.filter(entry => entry.job !== job)); active.delete(job); forgetTransferLease(job) }
export function releaseImportJournal(job: string) { active.delete(job); releaseTransferLease(job) }

/** Hidden candidates are rolled back after a crash; a committed copy is completed instead. */
let recovering: Promise<void> | undefined
export function recoverSessionTransfers() { return recovering ||= recover().finally(() => { recovering = undefined }) }
async function recover() {
  const entries = z.array(Entry).max(16).parse(await vault().db.getSetting(key) || [])
  for (const entry of entries) {
    if (active.has(entry.job)) continue
    await withIdleTransfer(entry.job, async () => { try {
      await vault().projects.assertFolder(entry.folderId)
      const ids = new Set(entry.ids), metadata = platform.getSessionMetaStorage(), rows = platform.getSessionRowStore()
      await metadata.initialize(); await rows.initialize()
      if (entry.committed) await metadata.update(entry.rootId, { hidden: false })
      else {
        const { veniceMediaService } = await import('@/packages/venice/service')
        for (const record of await veniceMediaService.list()) if (record.sessionId && ids.has(record.sessionId)) await veniceMediaService.remove(record.id)
        const images = platform.getImageGenerationStorage(); await images.initialize()
        let cursor: number | null = 0
        const remove: string[] = []
        do { const page = await images.getPage(cursor, 100); for (const record of page.items) if (record.source?.sessionId && ids.has(record.source.sessionId)) remove.push(record.id); cursor = page.nextCursor } while (cursor !== null)
        for (const id of remove) await images.delete(id)
        for (const id of entry.ids) { await rows.disposeImportRows?.(sessionImportCandidateId(entry.job, id)); await deleteSession(id) }
      }
      for await (const header of vault().db.all()) {
        if (header.status !== 'ready' || !vault().keys.isUnlocked(header.scope)) continue
        const info = await vault().assets.info(header)
        if (!info.sessionId || !ids.has(info.sessionId)) continue
        if (entry.committed && info.resourcePath) await vault().assets.describe('vault-asset-' + header.id, { ...info, hidden: false })
        else if (!entry.committed) await vault().assets.remove('vault-asset-' + header.id)
      }
      await finishImportJournal(entry.job)
    } catch { /* Locked scopes or unavailable storage stay journalled for the next unlock. */ } }, entry.createdAt ?? Date.now())
  }
  let removed = false
  const stages = new Map<string, { refs: string[]; createdAt: number }>()
  for await (const header of vault().db.all()) {
    const job = /^private-transfer-stage:([a-f0-9-]{36}):/.exec(header.alias || '')?.[1]
    if (job && !active.has(job) && !activeTransferSnapshots.has(job)) {
      const entry = stages.get(job) || { refs: [], createdAt: header.createdAt }; entry.refs.push('vault-asset-' + header.id); entry.createdAt = Math.max(entry.createdAt, header.createdAt); stages.set(job, entry)
    }
  }
  for (const [job, entry] of stages) await withIdleTransfer(job, async () => { for (const ref of entry.refs) await vault().assets.remove(ref); removed = true }, entry.createdAt)
  if (removed) await vault().assets.cleanupOrphans()
}

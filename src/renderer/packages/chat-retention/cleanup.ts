import { rendererApplication } from '@/app/renderer-application'
import { disposeTemporaryAgentRoot } from '@/packages/multi-agent/runtime'
import { cleanupSessionFiles } from '@/packages/session-resources/files'
import { installedVaultFor } from '@/packages/vault/runtime'
import { veniceMediaService } from '@/packages/venice/service'
import { sessionApprovals } from '@/packages/venice/session-approvals'
import platform from '@/platform'
import { inputBoxPreConstructedMessageFamily } from '@/stores/atoms/uiAtoms'
import { getImageGenerationService } from '@/stores/imageGenerationActions'
import { deleteSessionRecords } from '@/stores/session/crud'
import { stopAllMessageGenerations } from '@/stores/session/generation-cancellation'

/** Keep the journal until all app-owned storage operations have succeeded. */
export async function discardChatStorage(
  id: string,
  previous: string[] | undefined,
  remember: (ids: string[]) => Promise<void>,
) {
  await installedVaultFor(platform)?.projects.assertSession(id)
  const ids = new Set([id, ...(previous || [])])
  await stopAllMessageGenerations(id)
  await disposeTemporaryAgentRoot(id, async children => {
    for (const child of children) ids.add(child)
    await remember([...ids].filter(child => child !== id))
  })

  for (const record of await veniceMediaService.list()) {
    if (record.sessionId && ids.has(record.sessionId)) await veniceMediaService.remove(record.id)
  }
  const images = platform.getImageGenerationStorage()
  await images.initialize()
  const imageIds: string[] = []
  let cursor: number | null = 0
  do {
    const page = await images.getPage(cursor, 100)
    for (const record of page.items) {
      if (record.source?.sessionId && ids.has(record.source.sessionId)) imageIds.push(record.id)
    }
    cursor = page.nextCursor
  } while (cursor !== null)
  for (const imageId of imageIds) await getImageGenerationService().deleteRecord(imageId)

  for (const key of await platform.getAllStoreKeys()) {
    const owner = /^venice:image-call:([^:]+):/.exec(key)?.[1]
    if (owner && ids.has(owner)) await platform.delStoreValue(key)
  }

  for (const sessionId of [...ids].reverse()) {
    await cleanupSessionFiles(sessionId)
    if (platform.type === 'mobile') {
      const { capacitorWorkspace } = await import('@/packages/mobile-work-mode/runtime')
      await capacitorWorkspace.remove(sessionId)
    }
    const disk = await platform.sandboxRemoveArtifacts?.({ sessionId, includeWorkspace: true })
    if (disk && !disk.success) throw Error(disk.error || 'Unable to remove the chat workspace')
    sessionApprovals.clear(sessionId)
    localStorage.removeItem(`draft-${sessionId}`)
    inputBoxPreConstructedMessageFamily.remove(sessionId)
    // Row deletion also invalidates the mounted transcript and sidebar metadata.
    await deleteSessionRecords(sessionId)
  }

  // Attachments can be shared. The existing collector checks all owners before deleting a blob.
  const { cleanupOrphanedBlobs } = await import('@/setup/storage_clear')
  void cleanupOrphanedBlobs().catch(error => console.warn('Deferred attachment collection:', error))
}

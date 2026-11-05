import type { SessionFolderStorePort } from '@chatbox/core/ports'
import { SessionFolderSchema } from '@shared/types'
import { z } from 'zod'
import storage, { nonSessionStorageKey, StorageKey } from '@/storage'
import platform from '@/platform'
import { installedVaultFor } from '@/packages/vault/runtime'

// Loose so fields written by newer versions survive a load/save round trip here.
const SessionFoldersSchema = z.array(SessionFolderSchema.loose())

/** Persists folder definitions in the key-value store. */
export const rendererSessionFolderStore: SessionFolderStorePort = {
  async load() {
    const parsed = SessionFoldersSchema.safeParse(await storage.getItemRaw<unknown>(StorageKey.SessionFolders))
    return parsed.success ? parsed.data : []
  },
  async save(folders) {
    const access=installedVaultFor(platform)?.projects
    if(access){const previous=SessionFoldersSchema.safeParse(await storage.getItemRaw<unknown>(StorageKey.SessionFolders));if(previous.success)for(const folder of previous.data){const next=folders.find(item=>item.id===folder.id);if(!next||JSON.stringify(next)!==JSON.stringify(folder))await access.assertFolder(folder.id)}}
    await storage.setItemNow(nonSessionStorageKey(StorageKey.SessionFolders), folders)
  },
}

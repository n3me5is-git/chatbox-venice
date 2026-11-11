import { currentBlobStorage } from '@/adapters/CurrentBlobStorage'
import { localFileOrigin } from './local-file-origin'
import { mediaContentHash } from './media-content-hash'

/** Borrow the original asset only if its actual bytes still match. Crops inherit
 * privacy provenance, but must never resolve back to the uncropped image. */
export async function reusableLocalImageKey(file: File, data: string): Promise<string | undefined> {
  const origin = localFileOrigin(file)
  if (!origin) return undefined
  const hash = mediaContentHash(data)
  if (origin.contentHash && origin.contentHash !== hash) return undefined
  // Read through the guarded storage path: a lock, move or deletion since the
  // picker opened must not make a cached File bypass current access checks.
  const [{ installedVaultFor }, { default: platform }] = await Promise.all([import('./vault/runtime'), import('@/platform')])
  const vault = installedVaultFor(platform)
  const header = await vault?.find(origin.key)
  await vault?.projects.assertLibraryKey(header?.alias || origin.key)
  const current = await currentBlobStorage.get(origin.key)
  await vault?.projects.assertLibraryKey(header?.alias || origin.key)
  if (!current) throw new Error('This local item is no longer available')
  return mediaContentHash(current) === hash ? origin.key : undefined
}

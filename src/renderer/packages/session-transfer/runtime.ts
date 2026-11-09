import { SessionTransferHub } from './hub'
import { recoverSessionTransfers } from './journal'
import { installSharingBackground, syncSharingBackground } from '@/packages/collaboration/background'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import platform from '@/platform'
export const sessionTransfers = new SessionTransferHub()
let initialized = false
export function initializeSessionTransfers() {
  if (initialized) return
  initialized = true
  installSharingBackground(sessionTransfers.activeCount, sessionTransfers.stopAll, 'direct-transfer')
  sessionTransfers.subscribe(() => void syncSharingBackground())
  const recover = () => void recoverSessionTransfers().catch(() => {})
  recover(); vaultRuntimeFor(platform).keys.subscribe(recover)
  for (const event of ['chatbox:privacy-lock', 'pagehide', 'beforeunload']) window.addEventListener(event, sessionTransfers.stopAll)
}

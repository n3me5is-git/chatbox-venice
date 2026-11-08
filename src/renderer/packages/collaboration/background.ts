import { registerPlugin } from '@capacitor/core'
import platform from '@/platform'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import { forkT as ft } from '@/i18n/fork'

const native = registerPlugin<{ start(options: { title: string; text: string }): Promise<{ active: boolean }>; stop(): Promise<void>; status(): Promise<{ active: boolean }> }>('SharingBackground')
const listeners = new Set<() => void>()
let count = () => 0, close = () => {}, snapshot = { count: 0, foreground: false, error: '' }, chain = Promise.resolve()
export const sharingBackgroundSnapshot = () => snapshot
export const subscribeSharingBackground = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
function publish(patch: Partial<typeof snapshot>) { snapshot = { ...snapshot, ...patch }; for (const listener of listeners) listener() }
export function installSharingBackground(getCount: () => number, stopAll: () => void) { count = getCount; close = stopAll; syncSharingBackground() }
export function syncSharingBackground() {
  publish({ count: count() })
  chain = chain.catch(() => {}).then(async () => {
    const enabled = await vaultRuntimeFor(platform).db.getSetting<boolean>('keep-sharing-background') === true
    const active = count()
    if (platform.type !== 'mobile') { publish({ count: active, foreground: active > 0 && enabled }); return }
    if (active && enabled && !snapshot.foreground) {
      try { const state = await native.start({ title: ft('Active chat sharing'), text: ft('Chats are shared securely. Open the app to manage or stop sharing.') }); publish({ foreground: !!state.active, error: '' }) }
      catch { publish({ foreground: false, error: ft('Background sharing could not start. Automatic locking remains enabled.') }) }
    } else if ((!active || !enabled) && snapshot.foreground) { await native.stop().catch(() => {}); publish({ foreground: false, error: '' }) }
    publish({ count: count() })
  })
  return chain
}
export async function configureSharingBackground(enabled: boolean) { await vaultRuntimeFor(platform).db.setSetting('keep-sharing-background', enabled); vaultRuntimeFor(platform).keys.refresh(); await syncSharingBackground() }
export async function sharingMayPreventLock() { return count() > 0 && await vaultRuntimeFor(platform).db.getSetting<boolean>('keep-sharing-background') === true && (platform.type !== 'mobile' || snapshot.foreground) }
export function closeAllShares() { close(); void syncSharingBackground() }
if (typeof window !== 'undefined') window.addEventListener('chatbox:sharing-background-ended', () => { publish({ foreground: false }); if (count() > 0 && document.visibilityState === 'hidden') void import('@/components/security/AppGate').then(module => module.lockApplication()) })

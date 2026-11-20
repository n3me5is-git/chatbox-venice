import { useSyncExternalStore } from 'react'
import { rendererApplication } from '@/app/renderer-application'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import platform from '@/platform'
import { chatPathId, leavesTemporaryChat, retentionHours, shouldDiscardChat, type RetainedChat, type RetentionHours } from './journal'

const journalKey = 'chatbox:chat-retention:v1'
const listeners = new Set<() => void>()
let entries: RetainedChat[] = []
let activeTemporary: string | undefined
const creating = new Set<string>()
let initialization: Promise<void> | undefined
let bound = false
let navigation: typeof import('@/router').router | undefined
let work: Promise<unknown> = Promise.resolve()
let timeout: ReturnType<typeof setTimeout> | undefined

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const next = work.then(operation, operation)
  work = next
  return next
}

function publish() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function loadJournal() {
  return initialization ??= (async () => {
    const saved = await platform.getStoreValue(journalKey)
    if (Array.isArray(saved)) entries = saved as RetainedChat[]
    publish()
  })().catch(error => {
    initialization = undefined
    throw error
  })
}

async function write(id: string, entry?: RetainedChat) {
  const next = entries.filter(row => row.id !== id)
  if (entry) next.push(entry)
  await platform.setStoreValue(journalKey, next)
  entries = next
  publish()
}

export function getRetainedChat(id: string) {
  return entries.find(entry => entry.id === id)
}

export function useRetainedChat(id: string) {
  return useSyncExternalStore(subscribe, () => getRetainedChat(id))
}

export function useRetentionEntries() {
  return useSyncExternalStore(subscribe, () => entries)
}

export function isUnavailableChat(id: string) {
  const entry = getRetainedChat(id)
  return Boolean(entry && shouldDiscardChat(entry, activeTemporary, Date.now()))
}

export function isTemporaryChat(id: string) {
  const entry = getRetainedChat(id)
  return Boolean(entry && (entry.saving || entry.expiresAt === undefined))
}

export function isExcludedFromBackup(id: string) {
  return isTemporaryChat(id) || isUnavailableChat(id) || entries.some(entry => entry.children?.includes(id))
}

/** Called before the row write, so a crash cannot leave an untracked hidden chat. */
export function registerTemporaryChat(id: string) {
  return serialize(async () => {
    await loadJournal()
    await write(id, { id })
    creating.add(id)
    activeTemporary = id
  })
}

export function abandonTemporaryChat(id: string) {
  creating.delete(id)
  if (activeTemporary === id) activeTemporary = undefined
  requestSweep()
}

export function finishCreatingTemporaryChat(id: string): boolean {
  creating.delete(id)
  if (id === activeTemporary) return true
  requestSweep()
  return false
}

export function saveTemporaryChat(id: string, hours?: RetentionHours) {
  return serialize(async () => {
    const entry = getRetainedChat(id)
    if (!entry || entry.deleting || entry.expiresAt || id !== activeTemporary) throw Error('Temporary chat is unavailable')
    if (hours !== undefined && !retentionHours.includes(hours)) throw Error('Invalid retention period')
    const expiresAt = hours === undefined ? undefined : Date.now() + hours * 3_600_000
    await write(id, { ...entry, expiresAt, saving: true })
    try {
      await rendererApplication.sessions.updateSessionHeader(id, { hidden: false })
      activeTemporary = undefined
      await write(id, expiresAt === undefined ? undefined : { id, expiresAt })
    } catch (error) {
      requestSweep()
      throw error
    }
    schedule()
    await revealInSessionList()
  })
}

async function revealInSessionList() {
  const { sessionQueryBridge, sessions } = rendererApplication
  try {
    sessionQueryBridge.resetSessionList(await sessions.listSessionsMetaPage(0))
  } catch (error) {
    console.warn('Could not refresh the saved chat list:', error)
  }
}

async function discard(entry: RetainedChat) {
  const { id } = entry
  // A prior save may have published the visible header before the journal write.
  if (entry.saving && !entry.deleting) {
    const result = await rendererApplication.sessions.getSessionHeader(id)
    if (result?.header.hidden === false) {
      await write(id, entry.expiresAt === undefined ? undefined : { id, expiresAt: entry.expiresAt })
      if (activeTemporary === id) activeTemporary = undefined
      await revealInSessionList()
      return
    }
    if (activeTemporary === id) {
      await write(id, { id })
      return
    }
  }
  if (!entry.deleting) {
    entry = { ...entry, deleting: true }
    await write(id, entry)
  }
  const { discardChatStorage } = await import('./cleanup')
  await discardChatStorage(id, entry.children, async children => {
    const latest = getRetainedChat(id)
    if (latest) await write(id, { ...latest, children })
  })
  await write(id)
}

export function deleteRetainedChat(id: string): Promise<boolean> {
  return serialize(async () => {
    const entry = getRetainedChat(id)
    if (!entry) return false
    if (activeTemporary === id) activeTemporary = undefined
    await discard({ ...entry, saving: undefined })
    return true
  }).finally(schedule)
}

function schedule() {
  clearTimeout(timeout)
  const now = Date.now()
  let next = Infinity
  for (const entry of entries) {
    if (entry.saving || shouldDiscardChat(entry, activeTemporary, now)) next = Math.min(next, now + 30_000)
    else if (entry.expiresAt !== undefined) next = Math.min(next, entry.expiresAt)
  }
  if (Number.isFinite(next)) timeout = setTimeout(requestSweep, Math.min(next - now, 2_147_483_647))
}

function requestSweep() {
  void serialize(async () => {
    await loadJournal()
    for (const entry of entries) {
      if (creating.has(entry.id)) continue
      if (!entry.saving && !shouldDiscardChat(entry, activeTemporary, Date.now())) continue
      if (!entry.saving && navigation && chatPathId(navigation.state.location.pathname) === entry.id) {
        void navigation.navigate({ to: '/', replace: true })
      }
      try {
        await discard(entry)
      } catch (error) {
        // Retain the journal across app lock, storage detach and failed filesystem work.
        if (!(error instanceof Error && error.name === 'VaultLockedError')) console.warn('Deferred chat cleanup:', error)
      }
    }
  }).catch(error => console.warn('Could not read chat retention state:', error)).finally(schedule)
}

export async function initializeChatRetention() {
  await loadJournal()
  if (bound) return
  const { router } = await import('@/router')
  if (bound) return
  bound = true
  navigation = router
  router.subscribe('onResolved', ({ toLocation }) => {
    if (activeTemporary && leavesTemporaryChat(activeTemporary, toLocation.pathname)) abandonTemporaryChat(activeTemporary)
  })
  window.addEventListener('focus', requestSweep)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) requestSweep() })
  vaultRuntimeFor(platform).keys.subscribe(() => { if (entries.length) requestSweep() })
  requestSweep()
}

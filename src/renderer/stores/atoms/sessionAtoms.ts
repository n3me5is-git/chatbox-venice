import { atomWithStorage, createJSONStorage } from 'jotai/utils'

// current sessionId
const storage = createJSONStorage<string | null>()
export const currentSessionIdAtom = atomWithStorage<string | null>('_currentSessionIdCachedAtom', null, {
  ...storage,
  setItem(key, value) {
    try { return storage.setItem(key, value) }
    catch (error) {
      // This is only the last-open-chat cache. Do not suppress archive writes,
      // unavailable storage or unrelated failures elsewhere in the fork.
      if (typeof DOMException === 'undefined' || !(error instanceof DOMException) || error.name !== 'QuotaExceededError') throw error
      console.warn('Last-open-chat preference could not be saved: local storage is full')
    }
  },
})

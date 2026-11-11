// @vitest-environment jsdom
import { createStore } from 'jotai'
import { afterEach, expect, it, vi } from 'vitest'
import { currentSessionIdAtom } from './sessionAtoms'
afterEach(() => vi.restoreAllMocks())
it('lets navigation continue in memory if the preference cache is full', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const store = createStore()
  expect(() => store.set(currentSessionIdAtom, 'new-session')).not.toThrow()
  expect(store.get(currentSessionIdAtom)).toBe('new-session')
})
it('does not hide unrelated storage/security errors', () => {
  const error = new DOMException('Denied', 'SecurityError')
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw error })
  expect(() => createStore().set(currentSessionIdAtom, 'new-session')).toThrow(error)
})

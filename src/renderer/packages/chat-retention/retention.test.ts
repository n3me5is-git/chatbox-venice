// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RetainedChat } from './journal'

const fixture = vi.hoisted(() => ({
  rows: new Map<string, { header: { hidden: boolean } }>(),
  saved: [] as RetainedChat[],
  path: '/',
  route: (_event: { toLocation: { pathname: string } }) => {},
  unlock: () => {},
  discard: vi.fn(),
  navigate: vi.fn(),
  list: vi.fn(),
}))
vi.mock('@/platform', () => ({ default: {
  getStoreValue: async () => structuredClone(fixture.saved),
  setStoreValue: async (_key: string, value: RetainedChat[]) => { fixture.saved = structuredClone(value) },
} }))
vi.mock('@/app/renderer-application', () => ({ rendererApplication: { sessionQueryBridge: { resetSessionList: fixture.list }, sessions: {
  getSessionHeader: async (id: string) => fixture.rows.get(id),
  listSessionsMetaPage: async () => ({ items: [...fixture.rows.entries()].filter(([, row]) => !row.header.hidden).map(([id]) => ({ id })), nextCursor: null }),
  updateSessionHeader: async (id: string, patch: { hidden: boolean }) => { fixture.rows.get(id)!.header = patch },
} } }))
vi.mock('@/packages/vault/runtime', () => ({ vaultRuntimeFor: () => ({
  keys: { subscribe: (run: () => void) => { fixture.unlock = run } },
}) }))
vi.mock('@/router', () => ({ router: {
  state: { location: { get pathname() { return fixture.path } } },
  subscribe: (_name: string, fn: typeof fixture.route) => { fixture.route = fn },
  navigate: fixture.navigate,
} }))
vi.mock('./cleanup', () => ({ discardChatStorage: fixture.discard }))

const visit = (pathname: string) => {
  fixture.path = pathname
  fixture.route({ toLocation: { pathname } })
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  fixture.rows.clear()
  fixture.saved = []
  fixture.path = '/'
  fixture.list.mockClear()
  fixture.discard.mockReset().mockImplementation(async id => { fixture.rows.delete(id) })
  fixture.navigate.mockReset().mockImplementation(async ({ to }) => visit(to))
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

async function startChat() {
  const retention = await import('./retention')
  await retention.initializeChatRetention()
  await retention.registerTemporaryChat('temporary')
  expect(fixture.saved).toEqual([{ id: 'temporary' }])
  fixture.rows.set('temporary', { header: { hidden: true } })
  expect(retention.finishCreatingTemporaryChat('temporary')).toBe(true)
  visit('/session/temporary')
  return retention
}

describe('chat retention', () => {
  it('keeps the hidden chat through lock and settings, then discards it after switching chats', async () => {
    const retention = await startChat()
    expect(retention.isExcludedFromBackup('temporary')).toBe(true)
    fixture.unlock()
    visit('/settings/knowledge-base')
    await vi.advanceTimersByTimeAsync(1)
    expect(fixture.discard).not.toHaveBeenCalled()
    visit('/session/another')
    await vi.waitFor(() => expect(fixture.saved).toEqual([]))
    expect(fixture.discard).toHaveBeenCalledWith('temporary', undefined, expect.any(Function))
    expect(fixture.rows.has('temporary')).toBe(false)
  })

  it('promotes the same session permanently and preserves it after navigation', async () => {
    const retention = await startChat()
    await retention.saveTemporaryChat('temporary')
    expect(fixture.rows.get('temporary')?.header.hidden).toBe(false)
    expect(fixture.saved).toEqual([])
    expect(fixture.list).toHaveBeenCalledWith({ items: [{ id: 'temporary' }], nextCursor: null })
    visit('/')
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(fixture.discard).not.toHaveBeenCalled()
  })

  it('starts expiry at conversion, then sends the active expired chat home and deletes it', async () => {
    const retention = await startChat()
    await vi.advanceTimersByTimeAsync(700)
    const convertedAt = Date.now()
    await retention.saveTemporaryChat('temporary', 1)
    expect(fixture.rows.get('temporary')?.header.hidden).toBe(false)
    expect(fixture.saved).toEqual([{ id: 'temporary', expiresAt: convertedAt + 3_600_000 }])
    await vi.advanceTimersByTimeAsync(3_599_999)
    expect(fixture.discard).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(() => expect(fixture.saved).toEqual([]))
    expect(fixture.navigate).toHaveBeenCalledWith({ to: '/', replace: true })
    expect(fixture.rows.has('temporary')).toBe(false)
  })

  it('recovers a completed save and retries deletion after a storage failure, retaining child identities', async () => {
    fixture.saved = [
      { id: 'saved', saving: true },
      { id: 'old', expiresAt: Date.now() - 1 },
    ]
    fixture.rows.set('saved', { header: { hidden: false } })
    fixture.discard.mockImplementationOnce(async (_id, _children, remember) => {
      await remember(['child'])
      const error = new Error('Locked')
      error.name = 'VaultLockedError'
      throw error
    })
    const retention = await import('./retention')
    await retention.initializeChatRetention()
    await vi.waitFor(() => expect(fixture.saved).toEqual([
      { id: 'old', expiresAt: expect.any(Number), deleting: true, children: ['child'] },
    ]))
    expect(retention.isUnavailableChat('old')).toBe(true)
    expect(fixture.rows.has('saved')).toBe(true)
    fixture.unlock()
    await vi.waitFor(() => expect(fixture.saved).toEqual([]))
    expect(fixture.discard).toHaveBeenLastCalledWith('old', ['child'], expect.any(Function))
  })
})

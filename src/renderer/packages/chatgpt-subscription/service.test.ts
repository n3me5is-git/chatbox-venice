import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ request: vi.fn(), remove: vi.fn(), settings: vi.fn(), available: true }))
vi.mock('@shared/oauth/chatgpt-transport', () => ({ createSubscriptionTransport: () => (...args: any[]) => state.request(...args) }))
vi.mock('@/adapters/RendererModelDependencies', () => ({ createModelDependencies: async () => ({}) }))
vi.mock('@/platform', () => ({ default: {} }))
vi.mock('@/stores/settingsStore', () => ({ settingsStore: { getState: () => ({ providers: {}, setSettings: state.settings }) } }))
vi.mock('@/packages/vault/runtime', () => ({ vaultRuntimeFor: () => ({ available: async () => state.available, assets: {
  header: async () => ({ bytes: new TextEncoder().encode(JSON.stringify({ accessToken: 'synthetic-token', expiresAt: 9999999999999, extra: { accountId: 'fixture-account' } })).length }),
  async *read() { yield new TextEncoder().encode(JSON.stringify({ accessToken: 'synthetic-token', expiresAt: 9999999999999, extra: { accountId: 'fixture-account' } })) }, remove: (...args: any[]) => state.remove(...args),
} }) }))
import { disconnectSubscription, subscriptionAllowance } from './service'
const payload = { plan_type: 'pro', rate_limit: { primary_window: { used_percent: 20, limit_window_seconds: 604800, reset_at: 1800000000 } } }
beforeEach(() => { state.request.mockReset(); state.remove.mockReset(); state.settings.mockReset(); state.available = true })
it('reads a fixed HTTPS usage endpoint without redirects, API fallback or credential persistence', async () => {
  state.request.mockResolvedValue(new Response(JSON.stringify(payload)))
  expect((await subscriptionAllowance()).windows[0]).toMatchObject({ period: 'weekly', remaining: 80 })
  expect(state.request).toHaveBeenCalledWith('https://chatgpt.com/backend-api/wham/usage', expect.objectContaining({ method: 'GET', cache: 'no-store', redirect: 'error', headers: expect.objectContaining({ Authorization: 'Bearer synthetic-token', Accept: 'application/json', 'ChatGPT-Account-Id': 'fixture-account' }) }))
  expect(state.settings).not.toHaveBeenCalled()
})
it('rejects unsupported usage responses and does not make a request from a locked device', async () => {
  state.request.mockResolvedValueOnce(new Response('{}', { status: 403 }))
  await expect(subscriptionAllowance()).rejects.toThrow('HTTP 403')
  state.request.mockClear(); state.available = false; await expect(subscriptionAllowance()).rejects.toThrow('Unlock'); expect(state.request).not.toHaveBeenCalled()
})
it('drops an in-flight allowance when the account is disconnected', async () => {
  let finish!: (response: Response) => void
  state.request.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const reading = subscriptionAllowance()
  await vi.waitFor(() => expect(state.request).toHaveBeenCalledOnce()); await disconnectSubscription(); finish(new Response(JSON.stringify(payload)))
  await expect(reading).rejects.toThrow('connection was closed'); expect(state.remove).toHaveBeenCalledTimes(2)
  expect(JSON.stringify(state.settings.mock.calls)).not.toContain('synthetic-token')
})

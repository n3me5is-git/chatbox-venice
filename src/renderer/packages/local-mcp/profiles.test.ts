import { beforeEach, expect, it, vi } from 'vitest'
import { defaultLocalMCPPermissions, LocalMCPApplicationSchema, type LocalMCPGrant, type LocalMCPStart } from '@shared/local-mcp'
import { disableMCPStartup, readMCPProfiles, restoreMCPProfiles, saveMCPProfile, startupErrors } from './profiles'

const state = vi.hoisted(() => ({ profiles: null as unknown, key: new Map<string, string>(), invoke: vi.fn(), locked: false }))
vi.mock('@/platform', () => ({ default: { type: 'desktop' } }))
vi.mock('@/app/renderer-application', () => ({ rendererApplication: { sessions: { getSessionHeader: async () => ({ header: { id: 'chat' } }) } } }))
vi.mock('@/packages/chat-retention/retention', () => ({ isTemporaryChat: () => false, isUnavailableChat: () => false }))
vi.mock('@/packages/vault/device', () => ({ deviceProtector: () => ({
  protect: async (value: string) => { const envelope = crypto.randomUUID(); state.key.set(envelope, value); return envelope },
  unprotect: async (envelope: string) => state.key.get(envelope),
}) }))
vi.mock('@/packages/vault/runtime', () => ({ vaultRuntimeFor: () => ({
  available: async () => true,
  projects: { assertApp: async () => { if (state.locked) throw Error('Locked') }, assertSession: async () => {} },
  db: {
    getSetting: async () => state.profiles,
    setSettingIfUnchanged: async (_key: string, previous: unknown, value: unknown) => {
      if (state.profiles !== previous) return false
      state.profiles = value
      return true
    },
  },
}) }))

const token = 't'.repeat(43)
const app: LocalMCPStart = {
  sessionId:'application', endpointId:'f190ed96-70d6-4eaa-82f1-5e77a323a1bf', port:0,
  permissions:defaultLocalMCPPermissions, application:LocalMCPApplicationSchema.parse({name:'Router',mode:'router'}),
}
const chat: LocalMCPStart = { sessionId:'chat-123', port:0, permissions:defaultLocalMCPPermissions }
const grant = (config: LocalMCPStart, port: number): LocalMCPGrant => ({ ...config, running:true, url:`http://127.0.0.1:${port}/mcp`, token, startedAt:1 })
const signal = () => new AbortController().signal

beforeEach(() => {
  state.profiles = null; state.key.clear(); state.locked = false
  state.invoke.mockReset().mockResolvedValue({running:false})
  vi.stubGlobal('window', {electronAPI:{invoke:state.invoke}})
})

it('restores only opted-in profiles, pins automatic ports and persists no plaintext token', async () => {
  await saveMCPProfile(app, grant(app, 32910), false)
  await saveMCPProfile(chat, grant(chat, 32911), true)
  expect(JSON.stringify(await readMCPProfiles())).not.toContain(token)
  await restoreMCPProfiles(signal())
  expect(state.invoke.mock.calls.filter(call=>call[1]==='restore')).toEqual([
    ['local-mcp:control','restore',{config:{...chat,port:32911},accessToken:token}],
  ])
  await disableMCPStartup('shares')
  state.invoke.mockClear()
  await restoreMCPProfiles(signal())
  expect(state.invoke).not.toHaveBeenCalled()
})

it('blocks restoration while locked and rejects changes to the permissions bound to the token', async () => {
  await saveMCPProfile(app, grant(app, 32910), true)
  const profiles = await readMCPProfiles()
  state.locked = true
  await restoreMCPProfiles(signal())
  expect(state.invoke.mock.calls.some(call=>call[1]==='restore')).toBe(false)
  expect(startupErrors.has(app.endpointId!)).toBe(true)
  state.locked = false
  state.profiles = [{ ...profiles[0], permissions: { ...app.permissions, venice:true } }]
  await restoreMCPProfiles(signal())
  expect(state.invoke.mock.calls.some(call=>call[1]==='restore')).toBe(false)
  expect(startupErrors.has(app.endpointId!)).toBe(true)
})

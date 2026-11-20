// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import LocalMCPHost from './LocalMCPHost'

const state = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({ running: false })),
  restore: vi.fn(async () => {}),
  keyListener: undefined as ((scope?: string) => void) | undefined,
  appLock: false,
}))
vi.mock('@/platform', () => ({ default: { type: 'desktop' } }))
vi.mock('@/packages/vault/runtime', () => ({
  vaultRuntimeFor: () => ({
    keys: { subscribe: (listener: typeof state.keyListener) => { state.keyListener = listener; return () => {} } },
    projects: { isApplicationLocked: async () => state.appLock },
  }),
}))
vi.mock('@/app/renderer-application', () => ({
  rendererApplication: { sessionEvents: { subscribe: () => () => {} } },
}))
vi.mock('@/stores/settingsStore', () => ({ settingsStore: {} }))
vi.mock('@/components/security/AppGate', () => ({ isApplicationLockPending: () => state.appLock }))
vi.mock('@/packages/local-mcp/profiles', () => ({
  restoreMCPProfiles: state.restore, updateMCPProfiles: vi.fn(), localMCPChanged: vi.fn(),
}))
vi.mock('@/packages/local-mcp/application', () => ({ cleanupInactiveMCPContexts: vi.fn() }))
afterEach(cleanup)

it('keeps the host running across chat views and scoped protection changes', async () => {
  Object.assign(window, { electronAPI: { invoke: state.invoke, onLocalMCPRequest: () => () => {} } })
  const view = render(<><LocalMCPHost /><div key="first">First chat</div></>)
  await waitFor(() => expect(state.restore).toHaveBeenCalledOnce())
  state.invoke.mockClear()
  view.rerender(<><LocalMCPHost /><div key="second">Second chat</div></>)
  await act(async () => {
    state.keyListener?.('project:current')
    window.dispatchEvent(new Event('chatbox:privacy-lock'))
    state.keyListener?.('knowledge:locked')
  })
  expect(state.invoke).not.toHaveBeenCalled()
  state.appLock = true
  await act(async () => { window.dispatchEvent(new Event('chatbox:privacy-lock')) })
  expect(state.invoke).toHaveBeenCalledWith('local-mcp:control','suspend',true)
})

// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ begin: vi.fn(), complete: vi.fn(), pending: vi.fn(), cancel: vi.fn(), models: vi.fn(), open: vi.fn(), copy: vi.fn(), save: vi.fn() }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (value: string) => value }) }))
vi.mock('./ChatGPTAllowance', () => ({ ChatGPTAllowance: () => null }))
vi.mock('@/packages/chatgpt-subscription/service', () => ({ beginSubscriptionLogin: (...args: any[]) => state.begin(...args), completeSubscriptionLogin: (...args: any[]) => state.complete(...args), pendingSubscriptionLogin: () => state.pending(), cancelSubscriptionLogin: () => state.cancel(), subscriptionModels: () => state.models(), disconnectSubscription: vi.fn() }))
vi.mock('@/packages/chatgpt-subscription/browser', () => ({ openSubscriptionLoginPage: () => state.open() }))
vi.mock('@/packages/navigator', () => ({ copyToClipboard: (value: string) => state.copy(value) }))
vi.mock('@/stores/settingsStore', () => ({ useProviderSettings: () => ({ providerSettings: {}, setProviderSettings: state.save }) }))
import { ChatGPTSubscriptionSettings } from './ChatGPTSubscription'
const code = { userCode: 'PAIR-1234', deviceId: 'synthetic-device', interval: 5, expiresAt: Date.now() + 900000 }
beforeEach(() => {
  Object.values(state).forEach(fn => fn.mockReset()); state.pending.mockResolvedValue(undefined); state.begin.mockResolvedValue(code); state.complete.mockImplementation(() => new Promise(() => {})); state.open.mockResolvedValue(undefined); state.cancel.mockResolvedValue(undefined)
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }) })
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const mount = () => render(<MantineProvider><ChatGPTSubscriptionSettings /></MantineProvider>)
it('shows and copies the code before explicitly opening the external browser', async () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Sign in with ChatGPT' }))
  await screen.findByText(code.userCode); expect(state.open).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Copy login code' })); expect(state.copy).toHaveBeenCalledWith(code.userCode)
  fireEvent.click(screen.getByRole('button', { name: 'Open external browser' })); await waitFor(() => expect(state.open).toHaveBeenCalledOnce())
  expect(screen.getByText(code.userCode)).toBeTruthy(); fireEvent(window, new Event('focus')); expect(screen.getByText(code.userCode)).toBeTruthy()
})
it('keeps the code after polling or browser errors and can retry without minting a new code', async () => {
  state.complete.mockRejectedValueOnce(Error('Network interrupted')).mockImplementation(() => new Promise(() => {})); state.open.mockRejectedValue(Error('Browser unavailable'))
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Sign in with ChatGPT' })); await screen.findByText('Network interrupted')
  expect(screen.getByText(code.userCode)).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: 'Open external browser' })); await screen.findByText('Browser unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Continue sign-in' })); await waitFor(() => expect(state.complete).toHaveBeenCalledTimes(2)); expect(state.begin).toHaveBeenCalledOnce()
})
it('restores the encrypted pending login and clears it only on explicit cancel', async () => {
  state.pending.mockResolvedValue(code); mount(); await screen.findByText(code.userCode)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); await waitFor(() => expect(state.cancel).toHaveBeenCalledOnce()); expect(screen.queryByText(code.userCode)).toBeNull()
})
it('clears the code on confirmed authentication even when catalog refresh fails', async () => {
  let finish!: () => void; state.complete.mockImplementation(() => new Promise<void>(resolve => { finish = resolve })); state.models.mockRejectedValue(Error('catalog offline'))
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Sign in with ChatGPT' })); await screen.findByText(code.userCode)
  await act(async () => finish()); await screen.findByText(/Connected. The model catalog could not be refreshed/); expect(screen.queryByText(code.userCode)).toBeNull()
})

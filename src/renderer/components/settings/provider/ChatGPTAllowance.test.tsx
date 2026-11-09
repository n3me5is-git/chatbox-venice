// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { translationResources } from '@chatbox/i18n'
const state = vi.hoisted(() => ({ connected: true, request: vi.fn() }))
vi.mock('@/stores/settingsStore', () => ({ useProviderSettings: () => ({ providerSettings: state.connected ? { oauth: { accessToken: 'vault-marker' } } : {} }) }))
vi.mock('@/packages/chatgpt-subscription/service', () => ({ subscriptionAllowance: (signal: AbortSignal) => state.request(signal) }))
import { ChatGPTAllowance } from './ChatGPTAllowance'
const monthly = { id: 'codex:primary', group: 'ChatGPT', period: 'monthly', remaining: 75, duration: 2592000 }
beforeEach(async () => {
  state.connected = true; state.request.mockReset()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  await i18n.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', resources: translationResources, interpolation: { escapeValue: false } })
})
afterEach(() => cleanup())
describe('ChatGPT allowance UI', () => {
  it('shows the remaining monthly and optional weekly windows, and refreshes explicitly', async () => {
    state.request.mockResolvedValue({ plan: 'pro', windows: [monthly, { ...monthly, id: 'codex:secondary', period: 'weekly', remaining: 0, duration: 604800 }] })
    render(<MantineProvider><ChatGPTAllowance /></MantineProvider>)
    await screen.findByText('Monthly allowance: 75% remaining'); expect(screen.getByText('Weekly allowance: 0% remaining')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh ChatGPT allowance' })); await waitFor(() => expect(state.request).toHaveBeenCalledTimes(2))
  })
  it('uses Italian translations and does not invent a weekly window', async () => {
    await i18n.changeLanguage('it-IT'); state.request.mockResolvedValue({ plan: 'pro', windows: [monthly] })
    render(<MantineProvider><ChatGPTAllowance /></MantineProvider>)
    await screen.findByText('Quota mensile: 75% rimanente'); expect(screen.queryByText(/Quota settimanale/)).toBeNull()
  })
  it('keeps unavailable balances distinct from exhaustion and names five-hour windows correctly', async () => {
    state.request.mockResolvedValueOnce({ windows: [{ ...monthly, period: 'hours', duration: 18000 }] }).mockRejectedValueOnce(Error('HTTP 503'))
    render(<MantineProvider><ChatGPTAllowance /></MantineProvider>)
    await screen.findByText('Monthly allowance: Not reported by this account'); expect(screen.getByText('5-hour allowance: 75% remaining')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh ChatGPT allowance' })); await screen.findByText('ChatGPT allowance unavailable'); expect(screen.queryByText(/0% remaining/)).toBeNull()
  })
  it('clears on device lock and cannot display an obsolete in-flight response after disconnect', async () => {
    let resolve!: (value: unknown) => void
    state.request.mockImplementation(() => new Promise(done => { resolve = done }))
    const view = render(<MantineProvider><ChatGPTAllowance /></MantineProvider>)
    await waitFor(() => expect(state.request).toHaveBeenCalledOnce())
    state.connected = false; view.rerender(<MantineProvider><ChatGPTAllowance /></MantineProvider>)
    await act(async () => resolve({ windows: [monthly] }))
    expect(screen.queryByLabelText('ChatGPT allowance')).toBeNull()
    state.connected = true; state.request.mockResolvedValue({ windows: [monthly] }); view.rerender(<MantineProvider><ChatGPTAllowance /></MantineProvider>)
    await screen.findByText('Monthly allowance: 75% remaining')
    act(() => window.dispatchEvent(new Event('chatbox:privacy-lock'))); expect(screen.queryByText('Monthly allowance: 75% remaining')).toBeNull()
  })
})

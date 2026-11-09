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
const weekly = { id: 'codex:primary', group: 'ChatGPT', period: 'weekly', remaining: 75, duration: 604800 }
beforeEach(async () => {
  state.connected = true; state.request.mockReset()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  await i18n.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', resources: translationResources, interpolation: { escapeValue: false } })
})
afterEach(() => cleanup())
describe('ChatGPT allowance UI', () => {
  it('shows weekly and five-hour remaining percentages, and refreshes explicitly', async () => {
    state.request.mockResolvedValue({ plan: 'pro', windows: [weekly, { ...weekly, id: 'codex:secondary', period: 'hours', remaining: 0, duration: 18000 }] })
    render(<MantineProvider><ChatGPTAllowance /></MantineProvider>)
    await screen.findByText('Weekly allowance: 75% remaining'); expect(screen.getByText('5-hour allowance: 0% remaining')).toBeTruthy(); expect(screen.queryByText(/Monthly allowance/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh ChatGPT allowance' })); await waitFor(() => expect(state.request).toHaveBeenCalledTimes(2))
  })
  it('uses Italian translations and does not invent a weekly window', async () => {
    await i18n.changeLanguage('it-IT'); state.request.mockResolvedValue({ plan: 'pro', windows: [{ ...weekly, period: 'hours', duration: 18000 }] })
    render(<MantineProvider><ChatGPTAllowance /></MantineProvider>)
    await screen.findByText('Quota di 5 ore: 75% rimanente'); expect(screen.queryByText(/Quota settimanale/)).toBeNull(); expect(screen.queryByText(/Quota mensile/)).toBeNull()
  })
  it('keeps unavailable balances distinct from exhaustion and names five-hour windows correctly', async () => {
    state.request.mockResolvedValueOnce({ windows: [{ ...weekly, period: 'hours', duration: 18000 }] }).mockRejectedValueOnce(Error('HTTP 503'))
    render(<MantineProvider><ChatGPTAllowance /></MantineProvider>)
    await screen.findByText('5-hour allowance: 75% remaining'); expect(screen.queryByText(/Monthly allowance/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh ChatGPT allowance' })); await screen.findByText('ChatGPT allowance unavailable'); expect(screen.queryByText(/0% remaining/)).toBeNull()
  })
  it('clears on device lock and cannot display an obsolete in-flight response after disconnect', async () => {
    let resolve!: (value: unknown) => void
    state.request.mockImplementation(() => new Promise(done => { resolve = done }))
    const view = render(<MantineProvider><ChatGPTAllowance /></MantineProvider>)
    await waitFor(() => expect(state.request).toHaveBeenCalledOnce())
    state.connected = false; view.rerender(<MantineProvider><ChatGPTAllowance /></MantineProvider>)
    await act(async () => resolve({ windows: [weekly] }))
    expect(screen.queryByLabelText('ChatGPT allowance')).toBeNull()
    state.connected = true; state.request.mockResolvedValue({ windows: [weekly] }); view.rerender(<MantineProvider><ChatGPTAllowance /></MantineProvider>)
    await screen.findByText('Weekly allowance: 75% remaining')
    act(() => window.dispatchEvent(new Event('chatbox:privacy-lock'))); expect(screen.queryByText('Weekly allowance: 75% remaining')).toBeNull()
  })
  it('opens reset dates by tapping the allowance and closes the details on privacy lock', async () => {
    state.request.mockResolvedValue({ plan: 'pro', windows: [{ ...weekly, resetsAt: 1800000000000 }, { ...weekly, id: 'five-hour', period: 'hours', duration: 18000 }] })
    render(<MantineProvider><ChatGPTAllowance compact /></MantineProvider>)
    await screen.findByText('ChatGPT · Weekly allowance: 75% remaining')
    fireEvent.click(screen.getByRole('button', { name: 'View ChatGPT allowance details' }))
    await screen.findByRole('dialog', { name: 'ChatGPT allowance details' }); expect(screen.getByText(/^Resets /)).toBeTruthy(); expect(screen.getByText('Reset date not reported')).toBeTruthy()
    act(() => window.dispatchEvent(new Event('chatbox:privacy-lock'))); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

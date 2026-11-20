// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ChatRetentionAction, TemporaryChatToggle } from './ChatRetention'

const save = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/packages/chat-retention/retention', () => ({
  useRetainedChat: () => ({ id: 'chat' }),
  saveTemporaryChat: save,
}))
vi.mock('@/hooks/useScreenChange', () => ({ useIsSmallScreen: () => true }))
Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({
  matches: false, addEventListener() {}, removeEventListener() {},
}) })
globalThis.ResizeObserver = class { observe() {}; unobserve() {}; disconnect() {} }
afterEach(() => { cleanup(); save.mockClear() })

it('activates temporary chat from its header control', () => {
  const change = vi.fn()
  render(<MantineProvider env="test"><TemporaryChatToggle enabled={false} onChange={change} /></MantineProvider>)
  const toggle = screen.getByRole('button', { name: 'Temporary chat' })
  expect(toggle.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(toggle)
  expect(change).toHaveBeenCalledWith(true)
})

it('saves a temporary chat permanently from the header menu', async () => {
  render(<MantineProvider env="test"><ChatRetentionAction sessionId="chat" /></MantineProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Save temporary chat' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Save as a standard chat' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith('chat', undefined))
})

it('shows all retention choices in the mobile drawer and saves the selected period', async () => {
  render(<MantineProvider env="test"><ChatRetentionAction sessionId="chat" /></MantineProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Save temporary chat' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Save as an expiring chat' }))
  const thirtyDays = await screen.findByRole('radio', { name: '30 days' })
  expect(screen.getAllByRole('radio')).toHaveLength(7)
  expect((screen.getByRole('radio', { name: '24 hours' }) as HTMLInputElement).checked).toBe(true)
  fireEvent.click(thirtyDays)
  fireEvent.click(screen.getByRole('button', { name: 'Save chat' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith('chat', 720))
})

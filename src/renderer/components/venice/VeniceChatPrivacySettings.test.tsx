// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import type { VeniceChatSecurity } from '@shared/types/settings'
import type { VeniceOptions } from '@shared/providers/definitions/models/venice/options'
import { VeniceChatPrivacySettings } from './VeniceChatPrivacySettings'

vi.mock('react-i18next', () => ({ useTranslation: () => ({}) }))
vi.mock('@/components/common/AdaptiveModal', () => ({ AdaptiveModal: ({ opened, children }: any) => opened ? <div role="dialog">{children}</div> : null }))
Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
HTMLElement.prototype.scrollIntoView = vi.fn()
afterEach(cleanup)

const ordinary = { modelId: 'ordinary', vendorMetadata: { privacy: 'private' } }
function Harness({ provider = {}, initial }: { provider?: VeniceOptions; initial?: VeniceChatSecurity }) {
  const [value, setValue] = useState(initial)
  return <MantineProvider><VeniceChatPrivacySettings provider={provider} value={value} model={ordinary} onChange={setValue} />
    <pre data-testid="saved">{JSON.stringify(value || null)}</pre></MantineProvider>
}
const saved = () => JSON.parse(screen.getByTestId('saved').textContent!)
function selectMode(label: string) {
  fireEvent.click(screen.getByRole('textbox', { name: 'Secure text chat' }))
  fireEvent.click(screen.getByRole('option', { name: label }))
}

it('inherits provider security without silently changing an incompatible model or granting tools', () => {
  render(<Harness provider={{ textPrivacy: 'e2ee' }} />)
  expect(screen.getByRole('switch', { name: 'Use provider privacy defaults' })).toHaveProperty('checked', true)
  expect(screen.getByText(/Sending is blocked before contacting Venice/)).toBeTruthy()
  expect(screen.getByText('Tools: disabled for encrypted chat.')).toBeTruthy()
  expect(saved()).toBeNull()
})

it('requires confirmation before a chat can downgrade, leaves cancel unchanged, and preserves provider defaults', () => {
  const provider: VeniceOptions = { textPrivacy: 'e2ee', secureReceiptCompatibility: false }
  render(<Harness provider={provider} />)
  fireEvent.click(screen.getByRole('switch', { name: 'Use provider privacy defaults' }))
  selectMode('Standard HTTPS')
  expect(saved().textPrivacy).toBe('e2ee')
  fireEvent.click(within(screen.getByRole('dialog')).getByText('Cancel'))
  expect(saved().textPrivacy).toBe('e2ee')
  selectMode('Standard HTTPS')
  fireEvent.click(within(screen.getByRole('dialog')).getByText('Change privacy for this chat'))
  expect(saved().textPrivacy).toBe('standard')
  expect(screen.queryByText(/Sending is blocked before contacting Venice/)).toBeNull()
  expect(provider).toEqual({ textPrivacy: 'e2ee', secureReceiptCompatibility: false })
})

it('requires receipt and tool consent inside the chat without modifying the provider or another chat', () => {
  const provider: VeniceOptions = { textPrivacy: 'e2ee' }
  const view = render(<Harness provider={provider} />)
  fireEvent.click(screen.getByRole('switch', { name: 'Use provider privacy defaults' }))
  fireEvent.click(screen.getByRole('switch', { name: 'Compatible gateway receipts' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByText('Cancel'))
  expect(saved().secureReceiptCompatibility).toBe(false)
  fireEvent.click(screen.getByRole('switch', { name: 'Compatible gateway receipts' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByText('Enable compatible receipts'))
  fireEvent.click(screen.getByRole('switch', { name: 'Tools in encrypted chat' }))
  expect(saved().e2eeToolsEnabled).toBe(false)
  fireEvent.click(within(screen.getByRole('dialog')).getByText('Enable tools'))
  expect(saved()).toMatchObject({ secureReceiptCompatibility: true, e2eeToolsEnabled: true, e2eeToolMode: 'encrypted-text' })
  expect(provider).toEqual({ textPrivacy: 'e2ee' })
  view.unmount()
  render(<Harness provider={provider} />)
  expect(saved()).toBeNull()
  expect(screen.getByText('Response verification: strict payload binding.')).toBeTruthy()
})

it('confirms a downgrade when returning to weaker provider defaults', () => {
  render(<Harness initial={{ textPrivacy: 'e2ee' }} />)
  fireEvent.click(screen.getByRole('switch', { name: 'Use provider privacy defaults' }))
  expect(saved().textPrivacy).toBe('e2ee')
  fireEvent.click(within(screen.getByRole('dialog')).getByText('Change privacy for this chat'))
  expect(saved()).toBeNull()
  expect(screen.getByText(/Choosing an E2EE-capable model alone/)).toBeTruthy()
})

// @vitest-environment jsdom
import NiceModal from '@ebay/nice-modal-react'
import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor, cleanup, act } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProviderModelInfoSchema } from '@shared/types'
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (s: string) => s }) }))
vi.mock('@/hooks/useScreenChange', () => ({ useIsSmallScreen: () => false }))
vi.mock('@/adapters', () => ({ createModelDependencies: vi.fn() }))
vi.mock('@/utils/model-tester', () => ({ testModelCapabilities: vi.fn() }))
vi.mock('@/platform', () => ({ default: { isDesktopLike: false } }))
vi.mock('@/stores/settingsStore', () => ({ settingsStore: { getState: () => ({ customProviders: [] }) }, useProviderSettings: () => ({ providerSettings: { venice: { profiles: [{ id: 'research', name: 'Ricerca approfondita', options: { webSearch: 'on' } }] } } }) }))
import ModelEdit from './ModelEdit'
Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); Element.prototype.scrollIntoView = vi.fn() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('keeps Venice dropdown selections through a modal rerender and saves/reopens the actual model', async () => {
  render(<MantineProvider><NiceModal.Provider /></MantineProvider>)
  const model = { modelId: 'venice-chat', type: 'chat' as const, veniceProfile: {} }
  let saved: Promise<unknown>
  act(() => { saved = NiceModal.show(ModelEdit, { providerId: 'venice', model }) })
  fireEvent.click(await screen.findByLabelText('When to search the web', { selector: 'input' })); fireEvent.click(screen.getByRole('option', { name: 'For every message' }))
  fireEvent.click(screen.getByLabelText('Search engine', { selector: 'input' })); fireEvent.click(screen.getByRole('option', { name: 'Exa' }))
  // Updating NiceModal's wrapper props must not reset the draft for the same model.
  act(() => { void NiceModal.show(ModelEdit, { providerId: 'venice', model }) })
  await waitFor(() => expect((screen.getByLabelText('Search engine', { selector: 'input' }) as HTMLInputElement).value).toBe('Exa'))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  const result = ProviderModelInfoSchema.parse(await saved!)
  expect(result.veniceProfile).toMatchObject({ webSearch: 'on', searchProvider: 'exa' })
  act(() => { void NiceModal.show(ModelEdit, { providerId: 'venice', model: result }) })
  await waitFor(() => expect((screen.getByLabelText('Search engine', { selector: 'input' }) as HTMLInputElement).value).toBe('Exa'))
})

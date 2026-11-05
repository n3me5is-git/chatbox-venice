// @vitest-environment jsdom
import NiceModal from '@ebay/nice-modal-react'
import { MantineProvider } from '@mantine/core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/platform', () => ({ default: { isDesktopLike: false } }))
vi.mock('@/hooks/useScreenChange', () => ({ useIsSmallScreen: () => false }))
import { VeniceImageApproval } from './VeniceImageApproval'
const models = [{ modelId: 'gpt-flare-image', displayName: 'GPT Flare', capabilities: { aspectRatio: { values: ['1:1'] }, inputReferences: null } }]
Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); Element.prototype.scrollIntoView = vi.fn() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('preselects the resolved requested model and approves per-call settings without generating', async () => {
  render(<MantineProvider><NiceModal.Provider /></MantineProvider>); let result: Promise<unknown>
  act(() => { result = NiceModal.show(VeniceImageApproval, { models, request: { modelId: 'gpt-flare-image', prompt: 'A sunset', count: 1 } }) })
  expect((await screen.findByLabelText('Modello immagine Venice', { selector: 'input' }) as HTMLInputElement).value).toBe('GPT Flare')
  fireEvent.click(screen.getByLabelText('Filtro contenuti', { selector: 'input' })); fireEvent.click(screen.getByRole('option', { name: 'Disattivato' }))
  fireEvent.click(screen.getByRole('button', { name: 'Parametri della singola chiamata' })); fireEvent.change(screen.getByLabelText('Seed per questa generazione'), { target: { value: '42' } })
  fireEvent.click(screen.getByRole('button', { name: 'Conferma e genera' }))
  expect(await result!).toMatchObject({ modelId: 'gpt-flare-image', prompt: 'A sunset', count: 1, extraBody: { safe_mode: false, seed: 42 } })
})
it('does not silently choose the first model when no name was supplied', async () => {
  render(<MantineProvider><NiceModal.Provider /></MantineProvider>); let result: Promise<unknown>
  act(() => { result = NiceModal.show(VeniceImageApproval, { models, request: { prompt: 'A scene', count: 1 } }) })
  expect((await screen.findByLabelText('Modello immagine Venice', { selector: 'input' }) as HTMLInputElement).value).toBe('')
  expect((screen.getByRole('button', { name: 'Conferma e genera' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Annulla' })); expect(await result!).toBeNull()
})

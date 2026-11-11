// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { VeniceImageSettings } from './VeniceSettings'
const state = vi.hoisted(() => ({ save: vi.fn(), settings: { venice: { image: { format: 'jpeg', transparent_background: false } } } }))
vi.mock('@/stores/settingsStore', () => ({ useProviderSettings: () => ({ providerSettings: state.settings, setProviderSettings: state.save }) }))
vi.mock('@/packages/venice/service', () => ({ veniceMediaService: {} }))
Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
beforeEach(() => { state.save.mockClear(); vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('offers transparency on supported models and changes JPEG to PNG when enabled', () => {
  const model = { modelId: 'gpt-image-2-5-flare', vendorMetadata: { veniceType: 'image', constraints: { supportsTransparentBackground: true } } }
  const { rerender } = render(<MantineProvider><VeniceImageSettings model={model}/></MantineProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Venice images' }))
  fireEvent.click(screen.getByRole('switch', { name: /Transparent background/ }))
  expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ venice: expect.objectContaining({ image: expect.objectContaining({ transparent_background: true, format: 'png' }) }) }))
  rerender(<MantineProvider><VeniceImageSettings model={{ modelId: 'z-image-turbo', vendorMetadata: { veniceType: 'image' } }}/></MantineProvider>)
  expect(screen.queryByRole('switch', { name: /Transparent background/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Advanced image options' }))
  expect(screen.queryByLabelText('Elements to avoid')).toBeNull()
  expect(screen.getByRole('switch', { name: 'Hide watermark' })).toBeTruthy()
})

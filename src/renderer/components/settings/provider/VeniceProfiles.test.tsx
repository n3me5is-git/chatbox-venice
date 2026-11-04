// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VeniceProfileEditor, VeniceProfiles } from './VeniceProfiles'
const state = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('@/stores/settingsStore', () => ({ useProviderSettings: () => ({ providerSettings: { venice: {} }, setProviderSettings: state.save }) }))
Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
beforeEach(() => { state.save.mockClear(); vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); Element.prototype.scrollIntoView = vi.fn() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('Venice profile UI', () => {
  it('selects explicit moderation false and can restore inherited settings', () => {
    const onChange = vi.fn(); render(<MantineProvider><VeniceProfileEditor options={{}} value={{ webSearch: 'on' }} onChange={onChange} /></MantineProvider>)
    fireEvent.click(screen.getByLabelText('Moderazione immagini (safe mode)')); fireEvent.click(screen.getByRole('option', { name: 'Disattivata' }))
    expect(onChange).toHaveBeenCalledWith({ webSearch: 'on', imageSafeMode: false })
    fireEvent.click(screen.getByRole('button', { name: 'Ripristina tutte le opzioni ereditate' })); expect(onChange).toHaveBeenLastCalledWith({})
  })
  it('saves valid named profiles without API calls and rejects permission flags', () => {
    render(<MantineProvider><VeniceProfiles /></MantineProvider>)
    fireEvent.change(screen.getByLabelText('Nome profilo'), { target: { value: 'Ricerca privata' } }); fireEvent.change(screen.getByLabelText('Opzioni del profilo JSON'), { target: { value: '{"webSearch":"on","imageSafeMode":false}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva profilo' })); expect(state.save).toHaveBeenCalledWith({ venice: { profiles: [expect.objectContaining({ name: 'Ricerca privata', options: { webSearch: 'on', imageSafeMode: false } })] } })
    state.save.mockClear(); fireEvent.change(screen.getByLabelText('Opzioni del profilo JSON'), { target: { value: '{"audioEnabled":true}' } }); fireEvent.click(screen.getByRole('button', { name: 'Salva profilo' })); expect(screen.getByRole('alert')).toBeTruthy(); expect(state.save).not.toHaveBeenCalled()
  })
})

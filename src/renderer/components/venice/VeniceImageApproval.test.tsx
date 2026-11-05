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
  expect((await screen.findByLabelText("Venice image model", { selector: 'input' }) as HTMLInputElement).value).toBe('GPT Flare')
  fireEvent.click(screen.getByLabelText("Content filter", { selector: 'input' })); fireEvent.click(screen.getByRole('option', { name: "Off" }))
  fireEvent.click(screen.getByRole('button', { name: "Parameters for this call" })); fireEvent.change(screen.getByLabelText("Seed for this generation"), { target: { value: '42' } })
  fireEvent.click(screen.getByRole('button', { name: "Confirm and generate" }))
  expect(await result!).toMatchObject({ modelId: 'gpt-flare-image', prompt: 'A sunset', count: 1, extraBody: { safe_mode: false, seed: 42 } })
})
it('does not silently choose the first model when no name was supplied', async () => {
  render(<MantineProvider><NiceModal.Provider /></MantineProvider>); let result: Promise<unknown>
  act(() => { result = NiceModal.show(VeniceImageApproval, { models, request: { prompt: 'A scene', count: 1 } }) })
  expect((await screen.findByLabelText("Venice image model", { selector: 'input' }) as HTMLInputElement).value).toBe('')
  expect((screen.getByRole('button', { name: "Confirm and generate" }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: "Cancel" })); expect(await result!).toBeNull()
})

it('clears the previous searchable model when reopening after resetting approvals',async()=>{
 render(<MantineProvider><NiceModal.Provider/></MantineProvider>);let result:Promise<unknown>
 act(()=>{result=NiceModal.show(VeniceImageApproval,{models,request:{modelId:'gpt-flare-image',prompt:'first',count:1}})})
 expect((await screen.findByLabelText('Venice image model',{selector:'input'}) as HTMLInputElement).value).toBe('GPT Flare')
 fireEvent.click(screen.getByRole('button',{name:'Confirm and generate'}));await result!
 act(()=>{result=NiceModal.show(VeniceImageApproval,{models,request:{prompt:'second',count:1}})})
 expect((await screen.findByLabelText('Venice image model',{selector:'input'}) as HTMLInputElement).value).toBe('')
 expect((screen.getByRole('button',{name:'Confirm and generate'}) as HTMLButtonElement).disabled).toBe(true)
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(await result!).toBeNull()
})

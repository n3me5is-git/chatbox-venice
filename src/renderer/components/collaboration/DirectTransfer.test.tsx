// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ hosts: new Map<string, any>(), guests: new Map<string, any>(), analyze: vi.fn(), receive: vi.fn(), verify: vi.fn(), scope: vi.fn(), unlock: vi.fn(), compare: [] as any[], switched: vi.fn() }))
vi.mock('@/packages/session-transfer/runtime', () => ({ initializeSessionTransfers() {}, sessionTransfers: { hosts: state.hosts, guests: state.guests, subscribe: () => () => {}, getVersion: () => 0, changed() {}, verify: (...args: any[]) => state.verify(...args), read: vi.fn(), stop: vi.fn() } }))
vi.mock('@/packages/session-transfer/import', () => ({ analyzeTransfer: (...args: any[]) => state.analyze(...args), importTransfer: (...args: any[]) => state.receive(...args) }))
vi.mock('@/packages/session-transfer/snapshot', () => ({ prepareTransfer: vi.fn(), transferReceiptKey: (id: string) => id }))
vi.mock('@/packages/multi-agent/storage', () => ({ readAgentData: async () => ({ lineage: 'lineage' }) }))
vi.mock('@/app/renderer-application', () => ({ rendererApplication: { sessionHooks: { useSessionFolders: () => ({ folders: [{ id: 'secret', name: 'Protected project' }, { id: 'work', name: 'Work project' }] }) } } }))
vi.mock('@/platform', () => ({ default: { getStoreValue: async () => 'Receiving phone', getSessionMetaStorage: () => ({ initialize: async () => {}, getAllIncludingHidden: async () => state.compare }) } }))
vi.mock('@/packages/vault/runtime', () => ({ vaultRuntimeFor: () => ({ projects: { folderScope: state.scope }, keys: { isUnlocked: () => false } }) }))
vi.mock('@/components/security/requestUnlock', () => ({ requestProtectedAccess: (...args: any[]) => state.unlock(...args) }))
vi.mock('@/packages/collaboration/transport', () => ({ qrSvg: () => '' }))
vi.mock('@/packages/collaboration/qr', () => ({ pairingFromImage: vi.fn() }))
vi.mock('@/packages/navigator', () => ({ copyToClipboard: vi.fn() }))
vi.mock('@/stores/session/crud', () => ({ switchCurrentSession: (id: string) => state.switched(id) }))
import { DirectTransferContent } from './DirectTransfer'
beforeEach(() => {
  state.hosts.clear(); state.guests.clear(); state.compare = []; state.receive.mockReset(); state.analyze.mockReset(); state.verify.mockReset(); state.scope.mockReset(); state.unlock.mockReset(); state.switched.mockReset()
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); Element.prototype.scrollIntoView = vi.fn()
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  state.guests.set('room', { id: 'room', status: 'ready', manifest: { id: 'offer', rootId: 'root', lineage: 'lineage', sessions: [{ id: 'root', name: 'Work' }], objects: [{ kind: 'file', bytes: 1024 }] } })
  state.analyze.mockImplementation(async manifest => ({ manifest, plan: { downloadBytes: 1024, reusedBytes: 0, locallyChanged: [] } }))
  state.receive.mockResolvedValue({ rootId: 'received', sessions: 1, downloaded: 1024, reused: 0, warning: '' })
  state.verify.mockResolvedValue(undefined); state.scope.mockResolvedValue(null); state.unlock.mockResolvedValue(true)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
async function open() {
  render(<MantineProvider><DirectTransferContent /></MantineProvider>)
  fireEvent.click(screen.getByLabelText('Direct transfers', { selector: 'input' })); fireEvent.click(screen.getByRole('option', { name: 'Receive · Work' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Receive new chat' }).hasAttribute('disabled')).toBe(false))
}
describe('direct transfer receiver controls', () => {
  it('keeps project dropdown choices, allows renaming, and opens the saved local chat', async () => {
    await open()
    fireEvent.click(screen.getByLabelText('Receiving project', { selector: 'input' })); fireEvent.click(screen.getByRole('option', { name: 'Work project' }))
    expect((screen.getByLabelText('Receiving project', { selector: 'input' }) as HTMLInputElement).value).toBe('Work project')
    fireEvent.change(screen.getByLabelText('Chat name'), { target: { value: 'Continue on PC' } }); fireEvent.click(screen.getByRole('button', { name: 'Receive new chat' }))
    await waitFor(() => expect(state.receive).toHaveBeenCalledOnce()); expect(state.receive.mock.calls[0][2]).toMatchObject({ name: 'Continue on PC', folderId: 'work' })
    fireEvent.click(await screen.findByRole('button', { name: 'Open received chat' })); expect(state.switched).toHaveBeenCalledWith('received')
  })
  it('requires replacement confirmation and unlocks the selected protected destination', async () => {
    state.compare = [{ id: 'existing', name: 'Existing copy', folderId: 'secret' }]; state.scope.mockResolvedValue('project:secret')
    await open(); await waitFor(() => expect(state.analyze).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText('Save received chat as', { selector: 'input' })); fireEvent.click(screen.getByRole('option', { name: 'Replace Existing copy' }))
    const button = await screen.findByRole('button', { name: 'Receive and replace local chat' }); expect(button.hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByLabelText('I reviewed replacement and want to keep the received version'))
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false)); fireEvent.click(button)
    await waitFor(() => expect(state.receive).toHaveBeenCalledOnce()); expect(state.unlock).toHaveBeenCalledWith('project:secret'); expect(state.receive.mock.calls[0][2]).toMatchObject({ confirmLocalChanges: true, folderId: 'secret' })
  })
})

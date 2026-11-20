// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ActiveChatMCPShares } from './ActiveChatMCPShares'
import { ChatMCPShareControl } from './ChatMCPShareControl'

const state = vi.hoisted(() => ({
  platform: 'desktop', invoke: vi.fn(), show: vi.fn(), disable: vi.fn(),
  shares: [] as {sessionId:string;port:number}[],
}))
vi.mock('@/platform', () => ({ default: { get type() { return state.platform } } }))
vi.mock('@/app/renderer-application', () => ({ rendererApplication: { sessions: { repository: { meta: {
  getById: async (id: string) => ({name:id === 'current' ? 'Project notes' : 'Other chat'}),
} } } } }))
vi.mock('@/packages/chat-retention/retention', () => ({
  isTemporaryChat: () => false, isUnavailableChat: () => false, useRetainedChat: () => undefined,
}))
vi.mock('@/packages/local-mcp/profiles', () => ({
  disableMCPStartup: state.disable,
  localMCPChanged: () => window.dispatchEvent(new Event('local-mcp:state-changed')),
}))
vi.mock('@ebay/nice-modal-react', () => ({ default: { show:state.show } }))
vi.mock('./ChatMCPShareDialog', () => ({ ChatMCPShareDialog: 'fixture-dialog' }))

Object.defineProperty(window,'matchMedia',{value:()=>({matches:false,addEventListener(){},removeEventListener(){}})})
beforeEach(() => {
  state.platform = 'desktop'
  state.shares = [{sessionId:'current',port:31337},{sessionId:'other',port:31338}]
  state.show.mockReset()
  state.disable.mockReset().mockResolvedValue(undefined)
  state.invoke.mockReset().mockImplementation(async (_channel, command) => {
    if (command === 'list-shares') return state.shares
    if (command === 'stop-shares') state.shares = []
    return {running:false}
  })
  Object.assign(window,{electronAPI:{invoke:state.invoke}})
})
afterEach(cleanup)

it('shows this chat’s port and opens its scoped configuration modal', async () => {
  const closeMenu = vi.fn()
  render(<MantineProvider><ChatMCPShareControl sessionId="current" onOpen={closeMenu} /></MantineProvider>)
  await screen.findByText('Active on port 31337')
  expect(screen.queryByText('Active on port 31338')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Manage chat sharing'}))
  expect(closeMenu).toHaveBeenCalledOnce()
  await waitFor(()=>expect(state.show).toHaveBeenCalledWith('fixture-dialog',{sessionId:'current'}))
})

it('hides the chat host controls on Android and offers only stop controls in global settings', async () => {
  state.platform = 'mobile'
  const mobile=render(<MantineProvider><ChatMCPShareControl sessionId="current" onOpen={()=>{}} /></MantineProvider>)
  expect(screen.queryByText('Share this chat through MCP')).toBeNull()
  expect(state.invoke).not.toHaveBeenCalled()
  mobile.unmount()
  state.platform = 'desktop'
  render(<MantineProvider><ActiveChatMCPShares /></MantineProvider>)
  await screen.findByText('Project notes')
  expect(screen.getByText('Other chat')).toBeTruthy()
  expect(screen.queryByRole('button',{name:/start|manage/i})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Stop all chat shares'}))
  await screen.findByText('No chats are shared through MCP.')
  expect(state.disable).toHaveBeenCalledWith('shares')
  expect(state.invoke).toHaveBeenCalledWith('local-mcp:control','stop-shares')
  expect(state.invoke.mock.calls.some(call=>call[1]==='stop-all')).toBe(false)
})

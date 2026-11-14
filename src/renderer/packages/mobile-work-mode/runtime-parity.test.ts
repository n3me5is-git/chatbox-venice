import { createDefaultSettings } from '@chatbox/core/domain/settings'
import { createMessage, type Settings } from '@shared/types'
import type { ModelInterface } from '@shared/models/types'
import { beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  global: {} as Settings, current: {} as any, authorized: true,
  image: vi.fn(), venice: vi.fn(), mcp: vi.fn(), ask: vi.fn(), workspace: vi.fn(), agents: vi.fn(), spawn: vi.fn(), mentions: vi.fn(),
  vision: { reserve: vi.fn(), record: vi.fn(), toModelOutput: vi.fn() }, inject: vi.fn(async (messages: any[]) => messages),
}))
vi.mock('@/platform', () => ({ default: { type: 'mobile', isDesktopLike: false, getVersion: async () => 'test', getPlatform: async () => 'android' } }))
vi.mock('@/stores/settingsStore', () => ({ settingsStore: { getState: () => ({ providers: state.global.providers, getSettings: () => state.global }) } }))
vi.mock('@/stores/session/session-settings', () => ({ getSessionSettings: async () => state.current }))
vi.mock('@/app/renderer-application', () => ({ rendererApplication: { sessions: {} } }))
vi.mock('@/adapters/CurrentBlobStorage', () => ({ currentBlobStorage: { get: vi.fn(), set: vi.fn() } }))
vi.mock('./CapacitorWorkspace', () => ({ CapacitorWorkspace: class { seed = vi.fn() } }))
vi.mock('./capacitor-system-tools', () => ({ createCapacitorSystemToolGroups: () => [] }))
vi.mock('./normalize-work-image', () => ({ normalizeWorkImage: vi.fn() }))
vi.mock('@/packages/collaboration/bridge', () => ({
  assertSharedTurn: () => { if (!state.authorized) throw Error('Revoked') },
  routeSharedDecision: async (_id: string, _actor: string, _input: unknown, local: any) => local(new AbortController().signal),
}))
vi.mock('@/components/agent/UserQuestion', () => ({ requestUserAnswers: (...args: any[]) => state.ask(...args) }))
vi.mock('@/packages/session-resources/tools', async () => {
  const { tool } = await import('ai'); const { z } = await import('zod')
  return { sessionWorkspaceInstructions: 'Encrypted session workspace', buildSessionWorkspaceTools: async (...args: any[]) => {
    state.workspace(...args)
    return { session_file: tool({ inputSchema: z.object({ action: z.string() }), execute: async () => ({ files: [] }) }) }
  } }
})
vi.mock('@/packages/model-calls/toolsets/view-image', () => ({ buildViewImageToolSet: () => ({ imageResults: state.vision, injectImagesIntoStepMessages: state.inject }) }))
vi.mock('@/packages/chatgpt-subscription/image-tools', async () => {
  const { tool } = await import('ai'); const { z } = await import('zod')
  return { subscriptionChatImageTools: () => state.global.providers?.['openai-sub-unofficial']?.oauth && state.global.providers['openai-sub-unofficial'].subscriptionChatImages !== false
    ? { chatgpt_image: tool({ inputSchema: z.object({ action: z.string() }), execute: state.image }) } : {} }
})
vi.mock('@/packages/venice/tools', async () => {
  const { tool } = await import('ai'); const { z } = await import('zod')
  return { veniceChatTools: () => ({ venice_image: tool({ inputSchema: z.object({ action: z.string() }), execute: state.venice }) }) }
})
vi.mock('@/packages/mcp/mobile-tools', async () => {
  const { tool } = await import('ai'); const { z } = await import('zod')
  return { prepareMobileMCPTools: async () => ({ tools: { mcp_lookup: tool({ inputSchema: z.object({}), execute: state.mcp }) }, unavailable: [] }) }
})
vi.mock('@/packages/model-calls/toolsets/web-search', () => ({ buildWebSearchTools: () => ({ web_search_brave: {}, web_search_google: {}, web_search_exa: {} }), parseLinkTool: {} }))
vi.mock('@/packages/web-search', () => ({ PROVIDERS_WITH_PARSE_LINK: new Set() }))
vi.mock('@/stores/settingActions', () => ({ getExtensionSettings: () => ({ webSearch: { provider: 'venice' } }) }))
vi.mock('@/packages/prompt-mentions/chat-tool', () => ({ buildMentionedChatTools: (...args: any[]) => { state.mentions(...args); return { read_mentioned_chat: {} } } }))
vi.mock('@/packages/multi-agent/runtime', async () => {
  const { tool } = await import('ai'); const { z } = await import('zod')
  return { buildMultiAgentTools: async (...args: any[]) => { state.agents(...args); return { tools: { agent_spawn: tool({ inputSchema: z.object({ task: z.string() }), execute: state.spawn }) }, instructions: 'Delegation enabled' } } }
})
vi.mock('@/packages/model-calls/toolsets/knowledge-federation',()=>({getFederatedKnowledgeToolSet:vi.fn(async(ids:number[])=>({tools:{knowledge_base:{description:'Selected '+ids.join(',')}}}))}))
import { prepareCapacitorSessionTools, prepareCapacitorWorkMode, buildMobileWebTools } from './runtime'

const model = { apiStyle: 'openai-responses', modelId: 'text', name: 'OpenAI Sub Unofficial', isSupportSystemMessage: () => true, isSupportVision: () => false, isSupportToolUse: () => true } as unknown as ModelInterface
const options = { toolCallId: 'test', messages: [], context: {}, abortSignal: new AbortController().signal }
function request() {
  return { sessionId: 'session', settings: state.current, globalSettings: state.global, model, messages: [createMessage('user', 'Draw an image')], signal: new AbortController().signal, webBrowsing: true }
}
beforeEach(() => {
  vi.clearAllMocks(); state.authorized = true
  state.global = { ...createDefaultSettings(), providers: { 'openai-sub-unofficial': { oauth: { accessToken: 'connection-marker' } }, venice: { apiKey: 'synthetic' } } }
  state.current = { provider: 'openai-sub-unofficial', modelId: 'text', localWorkCapabilities: [], multiAgent: { enabled: true } }
  state.ask.mockResolvedValue({ answers: [{ selected: ['A'], text: 'Details' }] }); state.spawn.mockResolvedValue({ id: 'worker', status: 'running' }); state.image.mockResolvedValue({ recordId: 'image-job' })
})

it.each([false, true])('registers and activates subscription images, agents, HITL and search engines on Android; restored=%s', async restored => {
  const input = request(), prepared = await prepareCapacitorSessionTools(input, {}, restored)
  for (const name of ['chatgpt_image', 'agent_spawn', 'ask_user', 'session_file', 'mcp_lookup', 'web_search_brave', 'web_search_google', 'web_search_exa']) {
    expect(prepared.tools[name], name).toBeDefined(); expect(prepared.active.has(name), name).toBe(true)
  }
  expect(prepared.tools.venice_image).toBeUndefined()
  expect(prepared.instructions).toContain('prefer chatgpt_image'); expect(prepared.instructions).toContain('Delegation enabled')
  await expect(prepared.tools.chatgpt_image.execute?.({ action: 'models' }, options)).resolves.toEqual({ recordId: 'image-job' })
  await expect(prepared.tools.agent_spawn.execute?.({ task: 'Summarize' }, options)).resolves.toMatchObject({ id: 'worker' })
  await prepared.tools.ask_user.execute?.({ questions: [{ question: 'Choose', options: ['A', 'B'], multiple: true }] }, options)
  expect(state.ask).toHaveBeenCalledOnce()
  expect(state.agents).toHaveBeenCalledWith('session', state.current, expect.objectContaining({ chatgpt_image: expect.anything(), mcp_lookup: expect.anything(), session_file: expect.anything() }), input.messages)
  const caps = await prepared.tools.chatbox_cli.execute?.({ argv: ['capabilities'] }, options)
  expect(caps).toMatchObject({ imageGeneration: true, imageCommands: false, imageTools: ['chatgpt_image'], scope: 'chatbox_cli' })
})

it('uses the same tool registration from fresh Android generation preparation', async () => {
  const input = request()
  const prepared = await prepareCapacitorWorkMode({ ...input, session: { id: 'session', name: 'Chat', type: 'chat' }, messages: [...input.messages, createMessage('assistant', '')], targetMessageIndex: 1, attachments: { read: vi.fn() }, config: {uuid:'test'}, modelContext:{}, agentModeValue: 'on', agentModeLocked:true, agentModeSupported: true, preserveLastPromptMessageToolCalls:false, lockAgentMode:vi.fn() } as any, { tools: {}, instructions: '' } as any)
  expect(prepared.tools.chatgpt_image).toBeDefined(); expect(prepared.tools.agent_spawn).toBeDefined()
  const step = await prepared.chatOptions.prepareStep!({ messages: [] } as any) as any
  expect(step.activeTools).toContain('chatgpt_image'); expect(step.activeTools).toContain('agent_spawn')
  expect(JSON.stringify(prepared.promptMessages)).toContain('prefer chatgpt_image')
})

it('honors Venice cross-provider opt-in and restriction, provider-scoped subscription images and live revocation', async () => {
  state.current.veniceToolsEnabled = true
  const allowed = await prepareCapacitorSessionTools(request())
  expect(allowed.tools.venice_image).toBeDefined()
  state.global.providers!.venice.venice = { chatToolsVeniceOnly: true }
  await expect(allowed.tools.venice_image.execute?.({ action: 'models' }, options)).rejects.toThrow('disabled')
  expect((await prepareCapacitorSessionTools(request())).tools.venice_image).toBeUndefined()
  state.current = { ...state.current, provider: 'venice', veniceToolsEnabled: undefined }
  const venice = await prepareCapacitorSessionTools(request())
  expect(venice.tools.venice_image).toBeDefined(); expect(venice.tools.chatgpt_image).toBeUndefined()
  state.current.provider = 'openai-sub-unofficial'; state.global.providers!['openai-sub-unofficial'].subscriptionChatImages = false
  expect((await prepareCapacitorSessionTools(request())).tools.chatgpt_image).toBeUndefined()
  expect(buildMobileWebTools(model, false).tools).toEqual({})
})

it('wires encrypted image previews and owner-only conversation mentions, and guards remote tools after revocation', async () => {
  const input = request(); input.messages = [createMessage('user', 'Read [@Reference](chatbox:chat/reference)')]
  input.model = { ...model, isSupportVision: () => true }
  const owner = await prepareCapacitorSessionTools(input)
  expect(owner.tools.read_mentioned_chat).toBeDefined(); expect(state.workspace).toHaveBeenCalledWith('session', state.vision)
  await owner.prepareStepMessages([]); expect(state.inject).toHaveBeenCalledOnce()
  state.mentions.mockClear(); input.messages[0].collaborationAuthor = { id: 'guest-id', name: 'Guest' }; state.current.multiAgent.enabled = false
  const guest = await prepareCapacitorSessionTools(input)
  expect(guest.tools.read_mentioned_chat).toBeUndefined(); expect(state.mentions).not.toHaveBeenCalled()
  state.authorized = false
  expect(() => guest.tools.mcp_lookup.execute?.({}, options)).toThrow('Revoked')
  expect(() => guest.tools.ask_user.execute?.({ questions: [] }, options)).toThrow('Revoked')
  expect(state.mcp).not.toHaveBeenCalled()
})

it.each([false,true])('activates the selected global KB and federated collections in Android Work; resumed=%s',async restored=>{const input={...request(),knowledgeBase:{id:-1,name:'Manuals'}};input.settings.knowledgeCollectionIds=[-2];const prepared=await prepareCapacitorSessionTools(input,{},restored);expect(prepared.tools.knowledge_base.description).toBe('Selected -1,-2');expect(prepared.active.has('knowledge_base')).toBe(true)})

import type { Message, Settings } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { chatMock, createModelMock, globalSettingsMock } = vi.hoisted(() => ({
  chatMock: vi.fn(),
  createModelMock: vi.fn(),
  globalSettingsMock: { language: 'en', defaultChatModel: { provider: 'openai', model: 'gpt-4.1' } } as Settings,
}))

vi.mock('@/adapters', () => ({ createModel: createModelMock }))
vi.mock('@/i18n/locales', () => ({ languageNameMap: { en: 'English' } }))
vi.mock('@/packages/model-calls/message-utils', () => ({
  convertToModelMessages: vi.fn(async () => [{ role: 'user', content: 'Summarize' }]),
}))
vi.mock('@/packages/prompts', () => ({
  summarizeConversation: vi.fn(() => [
    { id: 'summary-prompt', role: 'user', contentParts: [{ type: 'text', text: 'Summarize' }] },
  ]),
}))
vi.mock('@/stores/settingActions', () => ({ getRemoteConfig: vi.fn(() => ({})) }))
vi.mock('@/stores/settingsStore', () => ({
  settingsStore: {
    getState: () => ({
      getSettings: () => globalSettingsMock,
    }),
  },
}))
vi.mock('@/utils/sentry', () => ({ reportError: vi.fn() }))

import { summarizeConversation } from '@/packages/prompts'
import { generateSummaryWithStream } from './summary-generator'

describe('generateSummaryWithStream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalSettingsMock.threadNamingModel = undefined
    globalSettingsMock.providers = undefined
    chatMock.mockResolvedValue({ contentParts: [{ type: 'text', text: 'Summary' }] })
    createModelMock.mockResolvedValue({
      isSupportVision: () => false,
      chat: chatMock,
    })
  })

  it('does not send a chat-only E2EE summary to the configured plaintext fast model', async () => {
    globalSettingsMock.threadNamingModel = { provider: 'openai', model: 'plaintext-fast' }
    const sessionSettings = { provider: 'venice', modelId: 'secure-chat', veniceSecurity: { textPrivacy: 'e2ee' as const, secureReceiptCompatibility: true } }
    await generateSummaryWithStream({ sessionId: 'encrypted-chat', messages: [{ id: 'u', role: 'user', contentParts: [{ type: 'text', text: 'Private' }] }], sessionSettings })
    expect(createModelMock).toHaveBeenLastCalledWith(expect.objectContaining(sessionSettings))
  })

  it('passes the custom prompt to the conversation formatter', async () => {
    const messages: Message[] = [{ id: 'u1', role: 'user', contentParts: [{ type: 'text', text: 'Conversation' }] }]
    await generateSummaryWithStream({ sessionId: 's1', messages, language: 'en', prompt: 'Keep all decisions.' })
    expect(summarizeConversation).toHaveBeenCalledWith(messages, 'English', 'Keep all decisions.')
  })

  it('passes the owning session id to the model request', async () => {
    const messages: Message[] = [{ id: 'user-1', role: 'user', contentParts: [{ type: 'text', text: 'Conversation' }] }]

    await expect(
      generateSummaryWithStream({ sessionId: 'session-1', messages, language: 'en' })
    ).resolves.toMatchObject({ success: true, summary: 'Summary' })

    expect(chatMock).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ sessionId: 'session-1' }))
  })
})

it('keeps a Venice summary on the selected provider despite a remote fast-model override', async () => {
  const messages: Message[] = [{ id: 'private', role: 'user', contentParts: [{ type: 'text', text: 'Private conversation' }] }]
  const { getRemoteConfig } = await import('@/stores/settingActions')
  vi.mocked(getRemoteConfig).mockReturnValue({ fastModel: { provider: 'chatbox-ai', model: 'remote-default' } } as never)
  createModelMock.mockResolvedValue({ isSupportVision: () => false, chat: chatMock })
  chatMock.mockResolvedValue({ contentParts: [{ type: 'text', text: 'Summary' }] })
  await generateSummaryWithStream({ sessionId: 'private-session', messages, sessionSettings: { provider: 'venice', modelId: 'chosen-model' } })
  expect(createModelMock).toHaveBeenCalledWith(expect.objectContaining({ provider: 'venice', modelId: 'chosen-model' }))
})

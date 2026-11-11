import { describe, expect, it, vi } from 'vitest'
import { newConfigs, settings as defaultSettings } from '../../defaults'
import type { ModelDependencies } from '../../types/adapters'
import type { CreateModelConfig } from '../types'
import { chatGLMProvider } from './chatglm'
import { zhipuGLMCodingPlanProvider } from './zhipu-glm-coding-plan'

describe('direct GLM networking on native hosts', () => {
  it.each([chatGLMProvider, zhipuGLMCodingPlanProvider])('$name carries mobile transport through the model to the actual request', async provider => {
    for (const platformType of ['mobile', 'desktop', 'web'] as const) for (const useProxy of [undefined, false, true]) {
      const apiRequest = vi.fn<ModelDependencies['request']['apiRequest']>(async () => new Response(JSON.stringify({ id: 'glm', object: 'chat.completion', created: 1, model: 'glm-test', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { headers: { 'content-type': 'application/json' } }))
      const dependencies: ModelDependencies = { platformType, request: { apiRequest, fetchWithOptions: vi.fn() }, storage: { saveImage: vi.fn(), getImage: vi.fn() }, sentry: { captureException: vi.fn(), withScope: vi.fn() }, getRemoteConfig: () => ({}) }
      const config: CreateModelConfig = { settings: { stream: false }, globalSettings: defaultSettings(), config: newConfigs(), dependencies, providerSetting: { useProxy }, formattedApiHost: provider.defaultSettings!.apiHost!, formattedApiPath: '/chat/completions', model: { modelId: 'glm-test', capabilities: ['tool_use'] }, effectiveApiKey: 'test-key' }
      const model = provider.createModel(config)
      for await (const _part of model.chatStream([{ role: 'user', content: 'Hi' }], {})) { /* drain */ }
      expect(apiRequest).toHaveBeenCalledOnce()
      expect(apiRequest.mock.calls[0][0]).toMatchObject({ method: 'POST', useProxy: platformType === 'mobile' || useProxy })
      expect(apiRequest.mock.calls[0][0].url).toMatch(/^https:\/\/open\.bigmodel\.cn\/api\//)
    }
  })
})

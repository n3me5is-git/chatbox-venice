import { expect, it } from 'vitest'
import { ModelProviderEnum } from '../types'
import { getReasoningControlOptions, getReasoningControlLevel, getReasoningProviderOptions } from '../utils/reasoning-control'
import { CHATGPT_CODEX_CLIENT_VERSION, SUBSCRIPTION_IMAGE_MODELS, mergeSubscriptionModels, parseSubscriptionModels, subscriptionDefaultModels } from './chatgpt-model-catalog'

it('includes every visible current Codex model and a version-free virtual image model', () => {
  const models = subscriptionDefaultModels(), ids = models.map(m => m.modelId)
  for (const id of ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', ...SUBSCRIPTION_IMAGE_MODELS]) expect(ids).toContain(id)
  expect(ids.some(id => /daybreak|auto-review/.test(id))).toBe(false)
  expect(CHATGPT_CODEX_CLIENT_VERSION).toBe('0.167.0')
  expect(models.filter(model => model.type === 'image').map(model => model.nickname)).toEqual(['ChatGPT Images'])
})
it('accepts new account model IDs, removes hidden models and deduplicates image IDs', () => {
  const models = parseSubscriptionModels({ models: [{ slug: 'future-model', visibility: 'list', input_modalities: ['text'], supported_reasoning_levels: [{ effort: 'low' }] }, { slug: 'hidden', visibility: 'hide' }, { slug: 'gpt-image-2.6-flare', type: 'image' }, { slug: 'https://foreign.invalid' }] })
  expect(models.find(m => m.modelId === 'future-model')).toMatchObject({ capabilities: ['tool_use', 'reasoning'], vendorMetadata: { catalogSource: 'account' } })
  expect(models.find(m => m.modelId === 'hidden')).toBeUndefined(); expect(models.filter(m => m.modelId === 'gpt-image-2.6-flare')).toHaveLength(1)
})
it('retains user nicknames and custom request bodies while updating actual capabilities', () => {
  expect(mergeSubscriptionModels([{ modelId: 'gpt-6-astra', nickname: 'My worker', extraBody: { foo: 'bar' }, capabilities: [] }], subscriptionDefaultModels()).find(m => m.modelId === 'gpt-6-astra')).toMatchObject({ nickname: 'My worker', extraBody: { foo: 'bar' }, capabilities: ['tool_use', 'vision', 'reasoning'] })
})
it('does not convert an invalid or empty account response into a confirmed catalog', () => {
  expect(() => parseSubscriptionModels({})).toThrow('invalid'); expect(() => parseSubscriptionModels({ models: [] })).toThrow('empty')
})
it('preserves manual endpoints, context budgets and thinking overrides after account refresh', () => {
  const saved = [{modelId:'gpt-6-astra',type:'chat' as const,contextWindow:180000,subscriptionEndpoint:'responses' as const,capabilities:['reasoning' as const],vendorMetadata:{catalogSource:'manual',codexReasoningEfforts:['low','max']}},{modelId:'my-image-model',type:'image' as const,subscriptionEndpoint:'images' as const}]
  const result = mergeSubscriptionModels(saved,subscriptionDefaultModels())
  expect(result.find(m=>m.modelId==='gpt-6-astra')).toMatchObject(saved[0])
  expect(result.find(m=>m.modelId==='my-image-model')).toEqual(saved[1])
  const updated=mergeSubscriptionModels([{...saved[0],vendorMetadata:{...saved[0].vendorMetadata,codexReportedContextWindow:128000}}],parseSubscriptionModels({models:[{slug:'gpt-6-astra',context_window:1000000,supported_reasoning_levels:[{effort:'high'}]}]}))
  expect(updated.find(m=>m.modelId==='gpt-6-astra')).toMatchObject({contextWindow:180000,vendorMetadata:{codexReportedContextWindow:1000000,codexReasoningEfforts:['low','max']}})
})
it('keeps model-specific reasoning levels including max without exposing harness-only ultra', () => {
  const model = subscriptionDefaultModels().find(m => m.modelId === 'gpt-6-astra')!
  const options = getReasoningControlOptions(ModelProviderEnum.OpenAISubscription, model)
  expect(options.map(o => o.level)).toEqual(['default', 'low', 'medium', 'high', 'xhigh', 'max'])
  const value = getReasoningProviderOptions(ModelProviderEnum.OpenAISubscription, model, 'max')
  expect(value?.openai?.reasoningEffort).toBe('max'); expect(getReasoningControlLevel(ModelProviderEnum.OpenAISubscription, model, value)).toBe('max')
})

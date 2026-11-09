import type { ProviderModelInfo } from '../types'
import snapshot from './chatgpt-codex-models.json'

// Latest stable Codex release checked 2026-11-09. No external version lookup during login.
export const CHATGPT_CODEX_CLIENT_VERSION = '0.167.0'
export const DEFAULT_SUBSCRIPTION_IMAGE_DRIVER = 'gpt-6-luna'
export const SUBSCRIPTION_IMAGE_MODELS = [
  'chatgpt-image-auto',
] as const
const efforts = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

export function subscriptionReasoningEfforts(model?: ProviderModelInfo | null): string[] {
  const values = model?.vendorMetadata?.codexReasoningEfforts
  if (Array.isArray(values)) return values.filter((v): v is string => typeof v === 'string' && efforts.has(v))
  const known = snapshot.models.find(row => row.slug === model?.modelId)
  if (known) return known.supported_reasoning_levels.map(row => row.effort).filter(value => efforts.has(value))
  return model?.capabilities?.includes('reasoning') ? ['low', 'medium', 'high', 'xhigh', 'max'] : []
}
function parseModel(model: Record<string, any>, account: boolean): ProviderModelInfo {
  const levels = Array.isArray(model.supported_reasoning_levels) ? model.supported_reasoning_levels.map((entry: any) => entry?.effort).filter((v: unknown): v is string => typeof v === 'string' && efforts.has(v)) : []
  const image = model.type === 'image' || model.slug.startsWith('gpt-image-')
  return { modelId: model.slug, nickname: typeof model.display_name === 'string' ? model.display_name : model.slug,
    type: image ? 'image' : 'chat', apiStyle: 'openai-responses',
    capabilities: image ? [] : ['tool_use', ...(model.input_modalities?.includes('image') ? ['vision' as const] : []), ...(levels.length || model.supports_reasoning_summaries ? ['reasoning' as const] : [])],
    ...(Number.isFinite(model.context_window) ? { contextWindow: model.context_window } : {}),
    vendorMetadata: { codexReasoningEfforts: levels, codexDefaultReasoningEffort: model.default_reasoning_level, catalogSource: account ? 'account' : 'codex-reference', ...(image ? { imageModelRequestedOnly: true } : {}) } }
}
export function subscriptionImageModels(): ProviderModelInfo[] {
  return SUBSCRIPTION_IMAGE_MODELS.map(modelId => ({ modelId, type: 'image', nickname: 'ChatGPT Images', subscriptionEndpoint: 'image-tool', vendorMetadata: { imageModelRequestedOnly: true, catalogSource: 'image-tool-request' } }))
}
export function subscriptionDefaultModels(): ProviderModelInfo[] {
  return [...snapshot.models.map(model => parseModel(model, false)), ...subscriptionImageModels()]
}
export function parseSubscriptionModels(payload: unknown): ProviderModelInfo[] {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).models)) throw Error('ChatGPT returned an invalid model catalog')
  const models = (payload as any).models.filter((model: any) => model && typeof model.slug === 'string' && /^[\w.:-]{1,200}$/.test(model.slug) && model.visibility !== 'hide').map((model: any) => parseModel(model, true))
  if (!models.length) throw Error('ChatGPT returned an empty model catalog. Configured models are kept.')
  return [...new Map([...subscriptionImageModels(), ...models].map(model => [model.modelId, model])).values()]
}
/** Catalog refresh retains locally configured nicknames and vendor request tweaks. */
export function mergeSubscriptionModels(saved: ProviderModelInfo[], current: ProviderModelInfo[]): ProviderModelInfo[] {
  const remote = new Map(current.map(model => [model.modelId, model]))
  return [...saved.map(model => { const next = remote.get(model.modelId); remote.delete(model.modelId); return next ? { ...next, ...model, type: next.type, apiStyle: next.apiStyle, capabilities: next.capabilities, vendorMetadata: next.vendorMetadata } : model }), ...remote.values()]
}

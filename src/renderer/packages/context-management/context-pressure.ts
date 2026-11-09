import { enrichModelFromRegistry, getRegistryModelMeta } from '@shared/model-registry/enrich'
import { mergeProviderModelCapabilities } from '@shared/providers/model-config'
import { getProviderDefinition, getSystemProviders } from '@shared/providers/registry'
import type { Settings } from '@shared/types'
import { DEFAULT_SUBSCRIPTION_CONTEXT_WINDOW, subscriptionDefaultModels } from '@shared/oauth/chatgpt-model-catalog'

/** Resolve a model's configured context window from provider settings, if any. */
export function getConfiguredContextWindow(
  settings: Pick<Settings, 'providers'>,
  providerId: string | undefined,
  modelId: string | undefined,
  projectedWindow?: number | null
): number | undefined {
  if (!providerId || !modelId) return undefined
  const stored = settings.providers?.[providerId]?.models?.find(model => model.modelId === modelId)
  const defaults = getProviderDefinition(providerId)?.defaultSettings?.models?.find(model => model.modelId === modelId)
    ?? (providerId === 'openai-sub-unofficial' ? subscriptionDefaultModels().find(model => model.modelId === modelId) : undefined)
  const configured = stored?.contextWindow ?? defaults?.contextWindow
    ?? (providerId === 'openai-sub-unofficial' ? DEFAULT_SUBSCRIPTION_CONTEXT_WINDOW : undefined)
  const declared = providerId === 'openai-sub-unofficial'
    ? stored?.vendorMetadata?.codexReportedContextWindow ?? defaults?.vendorMetadata?.codexReportedContextWindow
    : getRegistryModelMeta(providerId, modelId)?.contextWindow
  const values = [configured, declared, projectedWindow].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
  return values.length ? Math.min(...values) : undefined
}

/** The reply limit a request runs with: the session's max tokens, else the model's max output. */
export function getEffectiveMaxOutputTokens(
  settings: Pick<Settings, 'providers'>,
  providerId: string | undefined,
  modelId: string | undefined,
  sessionMaxTokens: number | undefined
): number | undefined {
  if (sessionMaxTokens !== undefined) return sessionMaxTokens
  if (!providerId || !modelId) return undefined
  const storedModel = settings.providers?.[providerId]?.models?.find((model) => model.modelId === modelId)
  const defaultModel =
    getSystemProviders()
      .find((provider) => provider.id === providerId)
      ?.defaultSettings?.models?.find((model) => model.modelId === modelId) ??
    getProviderDefinition(providerId)?.defaultSettings?.models?.find((model) => model.modelId === modelId)
  const model = mergeProviderModelCapabilities(storedModel, defaultModel) ?? { modelId }
  return enrichModelFromRegistry(model, providerId).maxOutput
}

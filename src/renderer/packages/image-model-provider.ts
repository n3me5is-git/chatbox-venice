import type { ImageModelOption } from '@chatbox/core/application/image-generation'
import { fetchOpenRouterImageModels } from '@shared/providers/definitions/models/openrouter-image-api'
import { settingsStore } from '@/stores/settingsStore'
import type { ProviderSettings } from '@shared/types'
import { ModelProviderEnum } from '@shared/types'
import { fetchVeniceCatalogModels, getVeniceImageCapabilities } from '@shared/providers/definitions/models/venice'

export type { ImageModelOption } from '@chatbox/core/application/image-generation'

import { createModelDependencies } from '@/adapters'
import { getModelManifest } from '@/packages/remote'
export interface ImageModelCatalogOptions {
  apiHost?: string
  venice?: ProviderSettings['venice']
  apiKey?: string
  licenseKey?: string
  language?: string
}

export async function loadProviderImageModels(
  provider: ModelProviderEnum,
  options: ImageModelCatalogOptions = {}
): Promise<ImageModelOption[]> {
  if (provider === ModelProviderEnum.OpenAISubscription) return ['gpt-image-2', 'gpt-image-1.5'].map(modelId => ({ modelId, displayName: modelId, capabilities: { aspectRatio: { values: ['auto', '1:1', '3:2', '2:3'] }, inputReferences: { max: 4 } } }))
  if (provider === ModelProviderEnum.Venice) {
    if (!options.apiKey || options.venice?.enabled === false || settingsStore.getState().providers?.venice?.venice?.enabled === false) return []
    const models = await fetchVeniceCatalogModels({ apiKey: options.apiKey, apiHost: options.apiHost, venice: options.venice }, await createModelDependencies())
    return models.filter((m) => m.type === 'image').map((m) => ({ modelId: m.modelId, displayName: m.nickname || m.modelId, description: String(m.vendorMetadata?.description || ''), vendorMetadata: m.vendorMetadata, capabilities: getVeniceImageCapabilities(m) }))
  }
  if (provider === ModelProviderEnum.OpenRouter && options.apiKey) {
    try {
      const dependencies = await createModelDependencies()
      const models = await fetchOpenRouterImageModels(options.apiKey, dependencies)
      return models.map((model) => ({
        modelId: model.modelId,
        displayName: model.nickname,
        ...(model.description ? { description: model.description } : {}),
        capabilities: model.capabilities,
      }))
    } catch {
      // Fall through to the Chatbox manifest when OpenRouter is unreachable.
    }
  }

  const manifest = await getModelManifest({
    aiProvider: provider,
    language: options.language,
    licenseKey: provider === ModelProviderEnum.ChatboxAI ? options.licenseKey : undefined,
  })
  return manifest.imageModels.map((model) => ({
    modelId: model.modelId,
    displayName: model.modelName || model.modelId,
    ...(model.description ? { description: model.description } : {}),
  }))
}

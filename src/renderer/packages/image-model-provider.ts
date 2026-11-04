import type { ImageModelOption } from '@chatbox/core/application/image-generation'
import { fetchOpenRouterImageModels } from '@shared/providers/definitions/models/openrouter-image-api'
import { ModelProviderEnum } from '@shared/types'
import { fetchVeniceModels, getVeniceImageCapabilities } from '@shared/providers/definitions/models/venice'

export type { ImageModelOption } from '@chatbox/core/application/image-generation'

import { createModelDependencies } from '@/adapters'
import { getModelManifest } from '@/packages/remote'
export interface ImageModelCatalogOptions {
  apiKey?: string
  licenseKey?: string
  language?: string
}

export async function loadProviderImageModels(
  provider: ModelProviderEnum,
  options: ImageModelCatalogOptions = {}
): Promise<ImageModelOption[]> {
  if (provider === ModelProviderEnum.Venice) {
    if (!options.apiKey) return []
    const models = await fetchVeniceModels({ apiKey: options.apiKey }, await createModelDependencies())
    return models.filter((m) => m.type === 'image').map((m) => ({ modelId: m.modelId, displayName: m.nickname || m.modelId, capabilities: getVeniceImageCapabilities(m) }))
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

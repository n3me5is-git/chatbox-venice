import { ModelProviderEnum, ModelProviderType } from '../../types'
import { defineProvider } from '../registry'
import Venice from './models/venice'
import { resolveVeniceSettings } from './models/venice/options'

export const veniceProvider = defineProvider({
  id: ModelProviderEnum.Venice,
  name: 'Venice',
  type: ModelProviderType.OpenAI,
  modelListSource: 'provider-only',
  urls: {
    website: 'https://venice.ai',
    apiKey: 'https://venice.ai/settings/api',
    docs: 'https://docs.venice.ai',
  },
  defaultSettings: {
    apiHost: 'https://api.venice.ai/api/v1',
    models: [],
  },
  createModel: (config) => new Venice({
    apiKey: config.effectiveApiKey,
    apiHost: config.formattedApiHost,
    model: config.model,
    temperature: config.settings.temperature,
    topP: config.settings.topP,
    maxOutputTokens: config.settings.maxTokens,
    stream: config.settings.stream,
    useProxy: config.providerSetting.useProxy,
    venice: resolveVeniceSettings(config.providerSetting.venice, config.model.veniceProfile, config.settings.veniceProfile),
  }, config.dependencies),
})

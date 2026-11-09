import { ModelProviderEnum, ModelProviderType } from '../../types'
import { defineProvider } from '../registry'
import OpenAIResponses from './models/openai-responses'
import { CHATGPT_CODEX_ENDPOINT, createSubscriptionFetch, readSubscriptionImages } from '../../oauth/chatgpt-subscription'
import { DEFAULT_SUBSCRIPTION_IMAGE_DRIVER, mergeSubscriptionModels, subscriptionDefaultModels } from '../../oauth/chatgpt-model-catalog'
import type { CallChatCompletionOptions } from '../../models/types'
import type { ChatStreamOptions, ModelStreamPart } from '../../models/types'
import type { ModelMessage, ToolSet } from 'ai'
import { subscriptionSourcesFooter, type SubscriptionSearchSource } from '../../oauth/chatgpt-search-sources'

export class ChatGPTSubscriptionModel extends OpenAIResponses {
  public name = 'OpenAI Sub Unofficial'
  public imageDriverModel = DEFAULT_SUBSCRIPTION_IMAGE_DRIVER
  public readonly searchSources = new Map<string, SubscriptionSearchSource>()
  public get usesNativeWebSearch() { return false } // Native search and Chatbox search remain independent.
  public override async *chatStream<T extends ToolSet>(messages: ModelMessage[], options: ChatStreamOptions): AsyncGenerator<ModelStreamPart<T>> {
    this.searchSources.clear(); let finish: ModelStreamPart<T> | undefined; let failed = false
    for await (const part of super.chatStream<T>(messages, options)) {
      if (part.type === 'finish') finish = part
      else { if (part.type === 'error') failed = true; yield part }
    }
    const text = failed ? '' : subscriptionSourcesFooter(this.searchSources.values())
    if (text) { const id = 'chatgpt-native-search-sources'; yield { type: 'text-start', id }; yield { type: 'text-delta', id, text }; yield { type: 'text-end', id } }
    if (finish) yield finish
  }
  protected getProviderConfig(options: CallChatCompletionOptions) {
    const config = super.getProviderConfig(options)
    // The subscription catalog supports max; the generic legacy OpenAI normalizer drops it.
    return { ...config, providerOptions: { ...config.providerOptions, openai: { ...options.providerOptions?.openai, store: false } } }
  }
  async paint(params: { prompt: string; images?: { imageUrl: string }[]; num: number; aspectRatio?: string }, signal?: AbortSignal, callback?: (image: string) => void | Promise<void>): Promise<string[]> {
    if (this.options.model.type !== 'image' && !this.options.model.modelId.startsWith('gpt-image-') && this.options.model.modelId !== 'chatgpt-image-auto') throw new Error('Select an image model from OpenAI Sub Unofficial')
    const images: string[] = [], fetcher = createSubscriptionFetch(this.dependencies, { extraBody: this.options.model.extraBody })
    const size = ({ '1:1': '1024x1024', '3:2': '1536x1024', '2:3': '1024x1536' } as Record<string, string>)[params.aspectRatio || ''] || 'auto'
    if (!Number.isInteger(params.num) || params.num < 1 || params.num > 4) throw new Error('Generate between one and four images')
    const refs = params.images || []
    if (refs.length > 4 || refs.some(ref => !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(ref.imageUrl) || ref.imageUrl.length > 16 * 1024 * 1024)) throw new Error('Use up to four local PNG, JPEG or WebP references')
    for (let n = 0; n < params.num; n++) {
      signal?.throwIfAborted()
      if (this.options.model.subscriptionEndpoint === 'images') {
        const { requestSubscriptionImages } = await import('../../oauth/chatgpt-subscription-images')
        for (const image of await requestSubscriptionImages(this.dependencies, { model: this.options.model.modelId, prompt: params.prompt, size, images: refs.map(ref => ref.imageUrl), extraBody: this.options.model.extraBody }, signal)) { images.push(image); await callback?.(image) }
        continue
      }
      const response = await fetcher(CHATGPT_CODEX_ENDPOINT, { method: 'POST', signal, body: JSON.stringify({ model: this.imageDriverModel, instructions: 'Generate or edit the requested image using the image generation tool.', input: [{ role: 'user', content: [{ type: 'input_text', text: params.prompt }, ...refs.map(ref => ({ type: 'input_image', image_url: ref.imageUrl }))] }], tools: [{ type: 'image_generation', ...(this.options.model.modelId !== 'chatgpt-image-auto' ? { model: this.options.model.modelId } : {}), size, output_format: 'png' }], tool_choice: { type: 'image_generation' }, stream: true, store: false }) })
      for (const image of await readSubscriptionImages(response, signal)) { images.push(image); await callback?.(image) }
    }
    return images
  }
}
export const openaiSubscriptionProvider = defineProvider({
  id: ModelProviderEnum.OpenAISubscription,
  name: 'OpenAI Sub Unofficial',
  type: ModelProviderType.OpenAIResponses,
  platforms: ['desktop', 'mobile'],
  description: 'Use your ChatGPT subscription through the community Codex route. Availability depends on your account.',
  urls: { website: 'https://chatgpt.com' },
  defaultSettings: { apiHost: 'https://api.openai.com/v1', models: subscriptionDefaultModels() },
  createModel: config => {
    const model: ChatGPTSubscriptionModel = new ChatGPTSubscriptionModel({ apiKey: 'vault-stored', apiHost: 'https://api.openai.com/v1', apiPath: '/responses', model: config.model, stream: true, customFetch: createSubscriptionFetch(config.dependencies, { webSearch: config.settings.subscriptionWebSearch ?? config.providerSetting.subscriptionWebSearch ?? false, extraBody: config.model.extraBody, onSource: source => { if (model.searchSources.size < 50) model.searchSources.set(source.url, source) } }), skipRemoteModelList: true, listModelsFallback: mergeSubscriptionModels(config.providerSetting.models || [], subscriptionDefaultModels()) }, config.dependencies)
    model.imageDriverModel = config.providerSetting.subscriptionImageDriver || DEFAULT_SUBSCRIPTION_IMAGE_DRIVER
    return model
  },
})

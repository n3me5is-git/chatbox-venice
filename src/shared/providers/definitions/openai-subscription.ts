import { ModelProviderEnum, ModelProviderType } from '../../types'
import { defineProvider } from '../registry'
import OpenAIResponses from './models/openai-responses'
import { CHATGPT_CODEX_ENDPOINT, createSubscriptionFetch, readSubscriptionImages } from '../../oauth/chatgpt-subscription'

const imageModels = ['gpt-image-2', 'gpt-image-1.5']
export class ChatGPTSubscriptionModel extends OpenAIResponses {
  public name = 'OpenAI Sub Unofficial'
  async paint(params: { prompt: string; images?: { imageUrl: string }[]; num: number; aspectRatio?: string }, signal?: AbortSignal, callback?: (image: string) => void | Promise<void>): Promise<string[]> {
    if (!imageModels.includes(this.options.model.modelId)) throw new Error('Select an image model from OpenAI Sub Unofficial')
    const images: string[] = [], fetcher = createSubscriptionFetch(this.dependencies)
    const size = ({ '1:1': '1024x1024', '3:2': '1536x1024', '2:3': '1024x1536' } as Record<string, string>)[params.aspectRatio || ''] || 'auto'
    if (!Number.isInteger(params.num) || params.num < 1 || params.num > 4) throw new Error('Generate between one and four images')
    const refs = params.images || []
    if (refs.length > 4 || refs.some(ref => !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(ref.imageUrl) || ref.imageUrl.length > 16 * 1024 * 1024)) throw new Error('Use up to four local PNG, JPEG or WebP references')
    for (let n = 0; n < params.num; n++) {
      signal?.throwIfAborted()
      const response = await fetcher(CHATGPT_CODEX_ENDPOINT, { method: 'POST', signal, body: JSON.stringify({ model: 'gpt-5.4', instructions: 'Generate or edit the requested image using the image generation tool.', input: [{ role: 'user', content: [{ type: 'input_text', text: params.prompt }, ...refs.map(ref => ({ type: 'input_image', image_url: ref.imageUrl }))] }], tools: [{ type: 'image_generation', model: this.options.model.modelId, size, output_format: 'png' }], tool_choice: { type: 'image_generation' }, stream: true, store: false }) })
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
  defaultSettings: { apiHost: 'https://api.openai.com/v1', models: [
    ...['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.6-sol'].map(modelId => ({ modelId, capabilities: ['vision', 'tool_use', 'reasoning'] as ('vision' | 'tool_use' | 'reasoning')[] })),
    ...imageModels.map(modelId => ({ modelId, type: 'image' as const })),
  ] },
  createModel: config => new ChatGPTSubscriptionModel({ apiKey: 'vault-stored', apiHost: 'https://api.openai.com/v1', apiPath: '/responses', model: config.model, stream: true, customFetch: createSubscriptionFetch(config.dependencies), skipRemoteModelList: true, listModelsFallback: config.providerSetting.models || openaiSubscriptionProvider.defaultSettings?.models }, config.dependencies),
})

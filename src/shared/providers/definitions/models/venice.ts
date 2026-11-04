import OpenAICompatible, { type OpenAICompatibleSettings } from '../../../models/openai-compatible'
import { ApiError } from '../../../models/errors'
import { createFetchWithProxy } from '../../../models/utils/fetch-proxy'
import { mergeExtraBody } from '../../../models/utils/extra-body'
import type { ProviderModelInfo, ProviderSettings, ImageModelCapabilities } from '../../../types'
import type { ModelDependencies } from '../../../types/adapters'
import { withVeniceCitations } from './venice-citations'
import { prepareVeniceSearch } from './venice-search'
import type { ModelMessage, ToolSet } from 'ai'
import type { CallChatCompletionOptions, ChatStreamOptions, ModelStreamPart } from '../../../models/types'

export type VeniceSettings = NonNullable<ProviderSettings['venice']>
interface VeniceOptions extends OpenAICompatibleSettings { venice?: VeniceSettings }
interface VeniceCatalogModel {
  id: string
  type: string
  model_spec?: {
    name?: string
    offline?: boolean
    availableContextTokens?: number
    capabilities?: Record<string, unknown>
    constraints?: Record<string, unknown>
  }
}

export async function fetchVeniceModels(
  options: { apiKey: string; apiHost?: string }, dependencies: ModelDependencies
): Promise<ProviderModelInfo[]> {
  const response = await dependencies.request.apiRequest({
    url: `${(options.apiHost || 'https://api.venice.ai/api/v1').replace(/\/+$/, '')}/models?type=all`,
    method: 'GET', headers: { Authorization: `Bearer ${options.apiKey}` }, useProxy: false,
  })
  if (!response.ok) throw new ApiError('Venice model discovery failed', await response.text(), response.status)
  const result = await response.json() as { data?: VeniceCatalogModel[] }
  if (!Array.isArray(result.data)) throw new ApiError('Invalid Venice model catalog')
  return result.data.filter((item) => ['text', 'image', 'inpaint'].includes(item.type) && !item.model_spec?.offline)
    .map((item): ProviderModelInfo => {
      const spec = item.model_spec
      const capabilities: NonNullable<ProviderModelInfo['capabilities']> = []
      if (item.type === 'text') {
        if (spec?.capabilities?.supportsVision) capabilities.push('vision')
        if (spec?.capabilities?.supportsReasoning) capabilities.push('reasoning')
        if (spec?.capabilities?.supportsFunctionCalling) capabilities.push('tool_use')
        if (spec?.capabilities?.supportsWebSearch) capabilities.push('web_search')
      }
      return { modelId: item.id, nickname: spec?.name, type: item.type === 'text' ? 'chat' : 'image',
        contextWindow: spec?.availableContextTokens, capabilities,
        vendorMetadata: { veniceType: item.type, constraints: spec?.constraints || {}, capabilities: spec?.capabilities || {} },
      }
    })
}

export function getVeniceImageCapabilities(model: ProviderModelInfo): ImageModelCapabilities {
  const metadata = model.vendorMetadata || {}
  const constraints = (metadata.constraints || {}) as Record<string, unknown>
  const capabilities = (metadata.capabilities || {}) as Record<string, unknown>
  const editing = metadata.veniceType === 'inpaint'
  const styleReferences = Boolean(constraints.supportsStyleReferences || capabilities.supportsStyleReferences)
  const max = editing ? Number(constraints.maxInputImages ?? capabilities.maxInputImages ?? (constraints.combineImages === false ? 1 : 3))
    : Number(constraints.maxStyleReferences ?? 1)
  const ratios = constraints.aspectRatios ?? constraints.aspect_ratios
  return {
    aspectRatio: { values: Array.isArray(ratios) ? ratios.filter((r): r is string => typeof r === 'string') : ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'] },
    inputReferences: editing || styleReferences ? { min: editing ? 1 : 0, max: Number.isFinite(max) ? max : 1 } : null,
  }
}

export function getVeniceParameters(settings: VeniceSettings = {}) {
  return {
    enable_web_search: settings.searchProvider && settings.searchProvider !== 'native' ? 'off' : settings.webSearch ?? 'off',
    enable_web_scraping: settings.webScraping ?? false,
    enable_web_citations: settings.webCitations ?? true,
    include_search_results_in_stream: settings.webCitations ?? true,
    enable_x_search: settings.xSearch ?? false,
    include_venice_system_prompt: settings.includeSystemPrompt ?? true,
  }
}

// Add vendor options after SDK serialization, for both chat transports and tool calls.
export function createVeniceFetch(fetch: typeof globalThis.fetch, settings?: VeniceSettings, extra?: ProviderModelInfo['extraBody']): typeof globalThis.fetch {
  return async (url, init) => {
    const endpoint = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
    if (new URL(endpoint).pathname.endsWith('/chat/completions') && typeof init?.body === 'string') {
      const body = mergeExtraBody({ ...JSON.parse(init.body), venice_parameters: getVeniceParameters(settings) }, extra || {})
      const response = await fetch(url, { ...init, body: JSON.stringify(body) })
      return withVeniceCitations(response)
    }
    return fetch(url, init)
  }
}

export default class Venice extends OpenAICompatible {
  public name = 'Venice'
  public options: VeniceOptions
  public override get usesNativeWebSearch() { return true }

  constructor(options: VeniceOptions, dependencies: ModelDependencies) {
    const resolved = { ...options, apiHost: options.apiHost.replace(/\/+$/, ''), useProxy: false,
      customFetch: createVeniceFetch(options.customFetch || createFetchWithProxy(false, dependencies), options.venice, options.model.extraBody),
    }
    super(resolved, dependencies)
    this.options = resolved
  }

  public override async chat(messages: ModelMessage[], options: CallChatCompletionOptions) {
    const prepared = await prepareVeniceSearch(messages, this.options.venice || {}, this.options.apiKey, this.options.apiHost, this.dependencies, this.isSupportToolUse(), options.signal)
    return super.chat(prepared.messages, { ...options, tools: { ...options.tools, ...prepared.tools } })
  }

  public override async *chatStream<T extends ToolSet>(messages: ModelMessage[], options: ChatStreamOptions): AsyncGenerator<ModelStreamPart<T>> {
    const prepared = await prepareVeniceSearch(messages, this.options.venice || {}, this.options.apiKey, this.options.apiHost, this.dependencies, this.isSupportToolUse(), options.signal)
    yield* super.chatStream<T>(prepared.messages, { ...options, tools: { ...options.tools, ...prepared.tools } })
  }

  public override listModels(): Promise<ProviderModelInfo[]> { return fetchVeniceModels(this.options, this.dependencies) }

  public override async paint(
    params: { prompt: string; images?: { imageUrl: string }[]; num: number; aspectRatio?: string },
    signal?: AbortSignal, callback?: (picBase64: string) => void | Promise<void>
  ): Promise<string[]> {
    if (!Number.isInteger(params.num) || params.num < 1 || params.num > 10) throw new ApiError('Choose 1 to 10 images')
    const settings = this.options.venice || {}
    const image = settings.image || {}
    const editing = this.options.model.vendorMetadata?.veniceType === 'inpaint'
    const capabilities = getVeniceImageCapabilities(this.options.model)
    const references = params.images || []
    if (editing && !references.length) throw new ApiError('This Venice model requires a reference image')
    if (references.length && (!capabilities.inputReferences || references.length > (capabilities.inputReferences.max ?? 1))) {
      throw new ApiError('The selected Venice model does not support this number of reference images')
    }
    if ((image.width === undefined) !== (image.height === undefined)) throw new ApiError('Set both image width and height')
    if (image.width !== undefined && params.aspectRatio && params.aspectRatio !== 'auto') throw new ApiError('Choose pixel dimensions or aspect ratio, not both')
    const format = image.format || 'png'
    const common = {
      prompt: params.prompt,
      safe_mode: settings.imageSafeMode ?? true,
      ...(image.resolution ? { resolution: image.resolution } : {}),
      ...(image.quality ? { quality: image.quality } : {}),
      ...(image.enhance_prompt !== undefined ? { enhance_prompt: image.enhance_prompt } : {}),
      ...(params.aspectRatio && params.aspectRatio !== 'auto' ? { aspect_ratio: params.aspectRatio } : {}),
    }
    const request = mergeExtraBody(editing ? {
      ...common, modelId: this.options.model.modelId, images: references.map((ref) => ref.imageUrl), output_format: format,
    } : {
      ...image, ...common, model: this.options.model.modelId,
      enable_web_search: settings.imageWebSearch ?? false,
      embed_exif_metadata: image.embed_exif_metadata ?? false,
      format, return_binary: false, variants: 1,
      ...(references.length ? { style_references: references.map((ref) => ({ image: ref.imageUrl })) } : {}),
    }, this.options.model.extraBody || {})
    const images: string[] = []
    for (let index = 0; index < params.num; index++) {
      signal?.throwIfAborted()
      const response = await this.dependencies.request.apiRequest({
        url: `${this.options.apiHost}/image/${editing ? 'multi-edit' : 'generate'}`,
        method: 'POST', headers: { Authorization: `Bearer ${this.options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal, useProxy: false,
        // Billable requests must never be replayed automatically.
        retry: 0,
      })
      if (!response.ok) throw new ApiError('Venice image generation failed', await response.text(), response.status)
      if (editing || response.headers.get('content-type')?.startsWith('image/')) {
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (!bytes.length) throw new ApiError('Venice returned an empty image')
        let binary = ''
        for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
        const responseType = response.headers.get('content-type')?.split(';')[0]
        const mediaType = responseType?.startsWith('image/') ? responseType : `image/${format}`
        const dataUrl = `data:${mediaType};base64,${btoa(binary)}`
        await callback?.(dataUrl)
        images.push(dataUrl)
      } else {
        const result = await response.json() as { images?: string[] }
        if (!result.images?.length || result.images.some((value) => typeof value !== 'string' || !value)) throw new ApiError('Venice returned no images')
        const actualFormat = String(request.format || 'png')
        for (const value of result.images) {
          const dataUrl = `data:image/${actualFormat};base64,${value}`
          await callback?.(dataUrl)
          images.push(dataUrl)
        }
      }
    }
    return images
  }
}

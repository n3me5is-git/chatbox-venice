import OpenAICompatible, { type OpenAICompatibleSettings } from '../../../models/openai-compatible'
import { assertVeniceEnabled } from './venice/options'
import { ApiError } from '../../../models/errors'
import { createFetchWithProxy } from '../../../models/utils/fetch-proxy'
import { mergeExtraBody } from '../../../models/utils/extra-body'
import type { ProviderModelInfo, ProviderSettings, ImageModelCapabilities, ToolUseScope } from '../../../types'
import type { ModelDependencies } from '../../../types/adapters'
import { withVeniceCitations } from './venice-citations'
import { prepareVeniceSearch } from './venice-search'
import { privacyAllowed, requireModelPrivacy, supportsTee } from './venice/privacy'
import { secureVeniceChat } from './venice/secure-chat'
import { effectiveVeniceSearch, guardSearchTools, isSearchTool } from './venice/search-policy'
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
    [key: string]: unknown
  }
}

export async function fetchVeniceModels(
  options: { apiKey: string; apiHost?: string; venice?: VeniceSettings }, dependencies: ModelDependencies
): Promise<ProviderModelInfo[]> {
  assertVeniceEnabled(options.venice || {})
  const response = await dependencies.request.apiRequest({
    url: `${(options.apiHost || 'https://api.venice.ai/api/v1').replace(/\/+$/, '')}/models?type=all`,
    method: 'GET', headers: { Authorization: `Bearer ${options.apiKey}` }, useProxy: false,
  })
  if (!response.ok) throw new ApiError('Venice model discovery failed', await response.text(), response.status)
  const result = await response.json() as { data?: VeniceCatalogModel[] }
  if (!Array.isArray(result.data)) throw new ApiError('Invalid Venice model catalog')
  return result.data.filter((item) => ['text', 'image', 'inpaint', 'embedding'].includes(item.type) && !item.model_spec?.offline && privacyAllowed(item.model_spec, options.venice?.privacyFilter))
    .map((item): ProviderModelInfo => {
      const spec = item.model_spec
      const capabilities: NonNullable<ProviderModelInfo['capabilities']> = []
      if (item.type === 'text') {
        if (spec?.capabilities?.supportsVision) capabilities.push('vision')
        if (spec?.capabilities?.supportsReasoning) capabilities.push('reasoning')
        if (spec?.capabilities?.supportsFunctionCalling) capabilities.push('tool_use')
        if (spec?.capabilities?.supportsWebSearch) capabilities.push('web_search')
      }
      return { modelId: item.id, nickname: spec?.name, type: item.type === 'text' ? 'chat' : item.type === 'embedding' ? 'embedding' : 'image',
        contextWindow: spec?.availableContextTokens, capabilities,
        vendorMetadata: { ...spec, veniceType: item.type, constraints: spec?.constraints || {}, capabilities: spec?.capabilities || {} },
      }
    })
}

export function getVeniceImageCapabilities(model: ProviderModelInfo): ImageModelCapabilities {
  const metadata = model.vendorMetadata || {}
  const constraints = (metadata.constraints || {}) as Record<string, unknown>
  const capabilities = (metadata.capabilities || {}) as Record<string, unknown>
  const editing = metadata.veniceType === 'inpaint'
  const styleReferences = Boolean(metadata.supportsStyleReferences || constraints.supportsStyleReferences || capabilities.supportsStyleReferences)
  const max = editing ? Number(constraints.maxInputImages ?? capabilities.maxInputImages ?? (constraints.combineImages === false ? 1 : 3))
    : Number(constraints.maxStyleReferences ?? 1)
  const ratios = constraints.aspectRatios ?? constraints.aspect_ratios
  return {
    aspectRatio: { values: Array.isArray(ratios) ? ratios.filter((r): r is string => typeof r === 'string') : ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'] },
    inputReferences: editing || styleReferences ? { min: editing ? 1 : 0, max: Number.isFinite(max) ? max : 1 } : null,
  }
}

export function getVeniceParameters(settings: VeniceSettings = {}) {
  settings = effectiveVeniceSearch(settings)
  return {
    enable_web_search: settings.searchToolMode === 'separate' || settings.searchProvider && settings.searchProvider !== 'native' ? 'off' : settings.webSearch ?? 'off',
    enable_web_scraping: settings.webScraping ?? false,
    enable_web_citations: settings.webCitations ?? true,
    include_search_results_in_stream: settings.webCitations ?? true,
    enable_x_search: settings.xSearch ?? false,
    include_venice_system_prompt: settings.includeSystemPrompt ?? true,
  }
}

// Add vendor options after SDK serialization, for both chat transports and tool calls.
export function createVeniceFetch(fetch: typeof globalThis.fetch, settings?: VeniceSettings, extra?: ProviderModelInfo['extraBody'], model?: ProviderModelInfo): typeof globalThis.fetch {
  return async (url, init) => {
    assertVeniceEnabled(settings || {})
    const endpoint = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
    if (settings?.privacyFilter && settings.privacyFilter !== 'all' && typeof init?.body === 'string') {
      const request = JSON.parse(init.body)
      requireModelPrivacy(model?.vendorMetadata, settings.privacyFilter)
      if (request.model && request.model !== model?.modelId) throw new Error('Model overrides cannot bypass Venice privacy settings')
    }
    if (new URL(endpoint).pathname.endsWith('/chat/completions') && typeof init?.body === 'string') {
      const parsed = JSON.parse(init.body)
      const effort = parsed.reasoning_effort ?? parsed.reasoningEffort
      delete parsed.reasoningEffort
      const thinking = parsed.enable_thinking
      delete parsed.enable_thinking
      const body = mergeExtraBody({ ...parsed, ...(effort !== undefined ? { reasoning_effort: effort } : {}), venice_parameters: { ...getVeniceParameters(settings), ...(thinking !== undefined ? { disable_thinking: !thinking } : {}) } }, extra || {})
      const mode = settings?.textPrivacy && settings.textPrivacy !== 'standard' ? settings.textPrivacy : settings?.privacyFilter === 'tee' ? 'tee' : undefined
      if ((settings?.privacyFilter && settings.privacyFilter !== 'all' || mode) && body.model !== model?.modelId) throw new Error('Model overrides cannot bypass Venice privacy settings')
      requireModelPrivacy(model?.vendorMetadata, settings?.privacyFilter)
      const toolMode=settings?.e2eeToolsEnabled===true?settings.e2eeToolMode||'encrypted-text':false
      if(mode==='e2ee'&&toolMode==='native'&&body.tools?.length&&(model?.vendorMetadata?.capabilities as Record<string,unknown>|undefined)?.supportsFunctionCalling!==true)throw new ApiError('This model does not declare native function calling. Choose encrypted text tools or another model.')
      const response = mode ? await secureVeniceChat(fetch, endpoint, init || {}, body, mode, toolMode) : await fetch(url, { ...init, body: JSON.stringify(body) })
      return withVeniceCitations(response)
    }
    return fetch(url, init)
  }
}

export default class Venice extends OpenAICompatible {
  public name = 'Venice'
  public options: VeniceOptions
  // Native model search and Chatbox's configured retrieval tool are independent.
  // Advertising native search unconditionally used to suppress the global search tool.
  public override get usesNativeWebSearch() { return this.options.venice?.textPrivacy === 'e2ee' && this.options.venice?.e2eeToolsEnabled !== true }

  public override isSupportToolUse(scope?: ToolUseScope) {
    if (this.options.venice?.textPrivacy === 'e2ee') return this.options.venice.e2eeToolsEnabled === true && (this.options.venice.e2eeToolMode!=='native'||(this.options.model.vendorMetadata?.capabilities as Record<string,unknown>|undefined)?.supportsFunctionCalling===true)
    return super.isSupportToolUse(scope)
  }

  constructor(options: VeniceOptions, dependencies: ModelDependencies) {
    assertVeniceEnabled(options.venice || {})
    requireModelPrivacy(options.model.vendorMetadata, options.venice?.privacyFilter)
    const secure = options.venice?.textPrivacy && options.venice.textPrivacy !== 'standard' || options.venice?.privacyFilter === 'tee'
    if (secure && options.model.type !== 'image' && options.model.type !== 'embedding' && !supportsTee(options.model.vendorMetadata)) throw new ApiError('Choose a model with Venice TEE support or change the secure text setting')
    if (options.venice?.textPrivacy === 'e2ee' && options.model.type !== 'image' && options.model.type !== 'embedding' && (options.model.vendorMetadata?.capabilities as Record<string, unknown> | undefined)?.supportsE2EE !== true) throw new ApiError('Choose an E2EE-capable model from the Venice catalog')
    const resolved = { ...options, apiHost: options.apiHost.replace(/\/+$/, ''), useProxy: false,
      customFetch: createVeniceFetch(options.customFetch || createFetchWithProxy(false, dependencies), options.venice, options.model.extraBody, options.model),
    }
    super(resolved, dependencies)
    this.options = resolved
  }

  public override async chat(messages: ModelMessage[], options: CallChatCompletionOptions) {
    const prepared = this.usesNativeWebSearch ? { messages } : await prepareVeniceSearch(messages, this.options.venice || {}, this.options.apiKey, this.options.apiHost, this.dependencies, this.isSupportToolUse(), options.signal)
    const guard = guardSearchTools({ ...options.tools, ...prepared.tools }, options.sessionId)
    return super.chat(prepared.messages, { ...options, tools: guard.tools, maxSteps: options.maxSteps ?? (Object.keys(guard.tools).some(isSearchTool) ? 12 : this.options.venice?.e2eeToolsEnabled ? 32 : undefined) })
  }

  public override async *chatStream<T extends ToolSet>(messages: ModelMessage[], options: ChatStreamOptions): AsyncGenerator<ModelStreamPart<T>> {
    const prepared = this.usesNativeWebSearch ? { messages } : await prepareVeniceSearch(messages, this.options.venice || {}, this.options.apiKey, this.options.apiHost, this.dependencies, this.isSupportToolUse(), options.signal)
    const nativeTools=Object.keys(prepared.tools||{})
    const originalStep=options.prepareStep
    const guard = guardSearchTools({ ...options.tools, ...prepared.tools }, options.sessionId)
    yield* super.chatStream<T>(prepared.messages, { ...options, tools: guard.tools,
      maxSteps: options.maxSteps ?? (Object.keys(guard.tools).some(isSearchTool) ? 12 : this.options.venice?.e2eeToolsEnabled ? 32 : undefined),
      prepareStep: async step => {
        const result = await originalStep?.(step)
        return { ...result, activeTools: guard.active([...new Set([...(result?.activeTools || Object.keys(guard.tools)), ...nativeTools])]) }
      } })
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
    if ((editing ? request.modelId : request.model) !== this.options.model.modelId || request.prompt !== params.prompt || (!editing && request.variants !== 1)) throw new ApiError('Model, prompt and quantity must match the approved request. Use the dedicated controls instead of overriding them in JSON.')
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

import type { MediaCatalogItem } from './media'

function declared(metadata: Record<string, unknown> | undefined, ...names: string[]): boolean | undefined {
  for (const source of [metadata?.constraints, metadata?.capabilities, metadata]) {
    if (!source || typeof source !== 'object') continue
    for (const name of names) if (typeof (source as Record<string, unknown>)[name] === 'boolean') return (source as Record<string, boolean>)[name]
  }
}

/** Catalog flags take precedence. The small fallbacks cover behavior documented
 * by Venice but not yet represented in /models. Do not infer across edit routes. */
export function imageStudioCapabilities(model: { modelId: string; vendorMetadata?: Record<string, unknown> }) {
  const metadata = model.vendorMetadata
  const generation = metadata?.veniceType !== 'inpaint'
  const flat = /^(venice-sd35|lustify-sdxl|lustify-v7|lustify-v8|wai-Illustrious|z-image-turbo|chroma)$/.test(model.modelId)
  const negative = /^(venice-sd35|lustify-sdxl|lustify-v7|lustify-v8|wai-Illustrious|qwen-image-2|qwen-image-2-pro|qwen-image-3|qwen-image-3-pro|wan-2-7-text-to-image|wan-2-7-pro-text-to-image)$/.test(model.modelId)
  return {
    negativePrompt: generation && (declared(metadata, 'supportsNegativePrompt', 'supports_negative_prompt') ?? negative),
    hideWatermark: generation && (declared(metadata, 'supportsHideWatermark', 'supports_hide_watermark') ?? flat),
    transparentBackground: declared(metadata, 'supportsTransparentBackground', 'supports_transparent_background') === true,
  }
}

export function videoSupportsNegativePrompt(model?: MediaCatalogItem): boolean {
  if (model?.type !== 'video') return false
  return declared(model.model_spec, 'supportsNegativePrompt', 'supports_negative_prompt') ?? /^(wan-|kling[-o])/.test(model.id)
}

export function speechSupportsStylePrompt(model?: MediaCatalogItem): boolean {
  if (model?.type !== 'tts') return false
  return declared(model.model_spec, 'supportsPromptParam', 'supports_prompt_param', 'supportsStylePrompt')
    ?? ['tts-qwen3-0-6b', 'tts-qwen3-1-7b', 'tts-gemini-3-1-flash'].includes(model.id)
}

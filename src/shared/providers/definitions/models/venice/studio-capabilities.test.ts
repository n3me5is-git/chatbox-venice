import { describe, expect, it } from 'vitest'
import { imageStudioCapabilities, speechSupportsStylePrompt, videoSupportsNegativePrompt } from './studio-capabilities'
import { buildVeniceImageRequest } from './image-request'
import { validateMediaRequest } from './media-capabilities'

describe('model-aware Studio controls', () => {
  it('uses catalog declarations before documented image fallbacks and keeps editing separate', () => {
    expect(imageStudioCapabilities({ modelId: 'venice-sd35' })).toMatchObject({ negativePrompt: true, hideWatermark: true, transparentBackground: false })
    expect(imageStudioCapabilities({ modelId: 'z-image-turbo' })).toMatchObject({ negativePrompt: false, hideWatermark: true })
    expect(imageStudioCapabilities({ modelId: 'venice-sd35', vendorMetadata: { constraints: { supportsNegativePrompt: false } } }).negativePrompt).toBe(false)
    expect(imageStudioCapabilities({ modelId: 'qwen-image-2-edit', vendorMetadata: { veniceType: 'inpaint' } }).negativePrompt).toBe(false)
  })
  it.each(['image', 'inpaint'])('sends real transparency only through a supporting %s route', type => {
    const model = { modelId: 'supported', vendorMetadata: { veniceType: type, constraints: { supportsTransparentBackground: true } } }
    const params = { prompt: 'A glass icon', images: type === 'inpaint' ? [{ imageUrl: 'data:image/png;base64,YQ==' }] : [] }
    const settings = { image: { transparent_background: true, format: 'png' as const, negative_prompt: 'stale', hide_watermark: true } }
    const built = buildVeniceImageRequest(model, settings, params)
    expect(built.request.transparent_background).toBe(true)
    expect(built.request).not.toHaveProperty('negative_prompt')
    expect(built.request).not.toHaveProperty('hide_watermark')
    expect(() => buildVeniceImageRequest(model, { image: { ...settings.image, format: 'jpeg' } }, params)).toThrow('PNG or WebP')
    expect(buildVeniceImageRequest({ ...model, vendorMetadata: { veniceType: type } }, settings, params).request).not.toHaveProperty('transparent_background')
  })
  it('does not carry unsupported image defaults to another model', () => {
    const settings = { image: { negative_prompt: 'Blur', hide_watermark: true } }
    expect(buildVeniceImageRequest({ modelId: 'venice-sd35' }, settings, { prompt: 'Icon' }).request).toMatchObject(settings.image)
    expect(buildVeniceImageRequest({ modelId: 'seedream-v5-5' }, settings, { prompt: 'Icon' }).request).not.toHaveProperty('negative_prompt')
  })
  it('shows documented video negatives and voice style only in compatible categories', () => {
    expect(videoSupportsNegativePrompt({ id: 'wan-2.5-preview-text-to-video', type: 'video' })).toBe(true)
    expect(videoSupportsNegativePrompt({ id: 'seedance-2.5-text-to-video', type: 'video' })).toBe(false)
    expect(videoSupportsNegativePrompt({ id: 'wan-new', type: 'video', model_spec: { constraints: { supportsNegativePrompt: false } } })).toBe(false)
    expect(speechSupportsStylePrompt({ id: 'tts-qwen3-1-7b', type: 'tts' })).toBe(true)
    expect(speechSupportsStylePrompt({ id: 'tts-gemini-3-1-flash', type: 'tts' })).toBe(true)
    expect(speechSupportsStylePrompt({ id: 'elevenlabs-tts-v4', type: 'music' })).toBe(false)
  })
  it('validates narration independently of style and bounds negative prompts', () => {
    expect(() => validateMediaRequest('speech', { input: 'Long narrated content', prompt: 'Calm' }, { id: 'tts-qwen3-1-7b', type: 'tts', model_spec: { min_prompt_length: 10 } })).not.toThrow()
    expect(() => validateMediaRequest('speech', { input: 'Text', prompt: 'x'.repeat(501) }, { id: 'tts-qwen3-1-7b', type: 'tts', model_spec: {} })).toThrow('500')
    expect(() => validateMediaRequest('video', { prompt: 'Scene', negative_prompt: 'x'.repeat(11) }, { id: 'wan', type: 'video', model_spec: { constraints: { prompt_character_limit: 10 } } })).toThrow('negative prompt')
  })
})

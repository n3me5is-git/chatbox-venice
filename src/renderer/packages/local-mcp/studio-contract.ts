import { audioQueueCapabilities, videoInputs, videoReferenceLimits, videoWorkflows } from '@shared/providers/definitions/models/venice/media-capabilities'
import type { MediaCatalogItem, MediaKind } from '@shared/providers/definitions/models/venice/media'
import { audioFormats, supportedValues } from '@shared/providers/definitions/models/venice/catalog'
import { imageStudioCapabilities, speechSupportsStylePrompt, videoSupportsNegativePrompt } from '@shared/providers/definitions/models/venice/studio-capabilities'
import type { ImageModelOption } from '@/packages/image-model-catalog'

export const studioKinds = ['image', 'speech', 'transcription', 'video', 'music', 'sound-effects', 'voice-conversion'] as const
export type StudioKind = typeof studioKinds[number]
const docs = 'https://docs.venice.ai/api-reference/endpoint/'

export const studioWorkflow = {
  discover: 'Call venice_studio with action catalog and the desired kind, then action describe with the exact kind and model ID.',
  attach: 'Upload local files with app_upload. Use its workspace paths in referencePaths, references or filePath as described by the model.',
  generate: 'Validate the proposed inputs, then use generate with a unique request_id. Paid requests may require owner approval.',
  retrieve: 'Use the returned id and kind with wait or status. Once ready, list and download files with app_resources. Do not regenerate to retrieve an output.',
  cleanup: 'Use app_cleanup to remove temporary local workspaces and results after retrieval. Use cleanup_remote for a supported queued job.',
}

export function describeStudioImage(model: ImageModelOption) {
  const refs = model.capabilities?.inputReferences
  const edit = model.vendorMetadata?.veniceType === 'inpaint'
  return {
    kind: 'image', model: model.modelId, name: model.displayName,
    documentation: docs + (edit ? 'image/multi-edit' : 'image/generate'),
    metadata: model.vendorMetadata,
    inputs: { prompt: { required: true }, referencePaths: refs ? { ...refs, role: edit ? 'edit-source' : 'style-reference' } : null },
    aspectRatios: model.capabilities?.aspectRatio?.values,
    advanced: imageStudioCapabilities(model),
    pricing: model.vendorMetadata?.pricing,
    example: { action: 'validate', kind: 'image', model: model.modelId, prompt: 'A sunlit coastal landscape in soft watercolor.', ...(refs?.min ? { referencePaths: ['input/source.png'] } : {}) },
    workflow: studioWorkflow,
  }
}

export function describeStudioMedia(kind: MediaKind, model: MediaCatalogItem, enabled: boolean) {
  const spec = model.model_spec ?? {}
  const queuedAudio = kind === 'music' || kind === 'sound-effects' || kind === 'speech' && model.type === 'music'
  const audio = queuedAudio ? audioQueueCapabilities(model) : undefined
  const video = kind === 'video' ? videoInputs(model) : undefined
  const fileRequired = kind === 'transcription' || kind === 'voice-conversion'
  const fileAccept = kind === 'voice-conversion' ? spec.accepted_audio_formats : ['audio/*', 'video/*']
  const exampleOptions = audio?.lyrics.minimum ? { lyrics_prompt: '[Verse] Our footsteps echo softly in the morning light.' } : undefined
  const exampleReferences = video ? {
    ...(video.start ? { image_url: 'input/start.png' } : {}),
    ...(video.end && (spec.constraints?.requires_end_image === true || /first-last|first-and-last|start-end|transition/.test(model.id)) ? { end_image_url: 'input/end.png' } : {}),
    ...(video.references ? { reference_image_urls: ['input/reference.png'] } : {}),
    ...(video.video && !video.references ? { video_url: 'input/source.mp4' } : {}),
  } : undefined
  return {
    kind, model: model.id, name: spec.name || model.id, enabled, metadata: spec, pricing: spec.pricing,
    documentation: docs + (queuedAudio ? 'audio/queue' : kind === 'video' ? 'video/queue' : kind === 'speech' ? 'audio/speech' : kind === 'transcription' ? 'audio/transcriptions' : 'audio/voice-changer/queue'),
    inputs: { prompt: { required: !fileRequired, minLength: spec.min_prompt_length, maxLength: spec.prompt_character_limit },
      filePath: fileRequired ? { required: true, formats: fileAccept, maxBytes: 25 * 1024 * 1024 } : null },
    audio: audio && { ...audio, defaultVoice: spec.default_voice, customVoiceId: spec.supports_custom_voice_id === true,
      speed: spec.supports_speed ? { min: spec.min_speed ?? 0.25, max: spec.max_speed ?? 4 } : undefined,
      outputFormats: audioFormats(model),
      referenceParameter: audio.references ? 'references.reference_audio_urls. Use @Audio1, @Audio2 in prompt. Omit preset voice.' : undefined,
      quoteOptions: [...(audio.duration.supported ? ['duration_seconds'] : []), ...(spec.pricing?.per_thousand_characters ? ['character_count'] : [])] },
    video: video && { inputs: video, referenceLimits: videoReferenceLimits(model), workflows: videoWorkflows(model), negativePrompt: videoSupportsNegativePrompt(model),
      durations: supportedValues(model, 'durations', 'duration', 'durationOptions'), resolutions: supportedValues(model, 'resolutions', 'resolution'),
      aspectRatios: supportedValues(model, 'aspectRatios', 'aspect_ratios', 'aspect_ratio') },
    voice: kind === 'speech' || kind === 'voice-conversion' ? { choices: spec.voices, default: spec.default_voice, formats: audioFormats(model),
      stylePromptOption: speechSupportsStylePrompt(model) ? 'options.prompt' : undefined, cloning: spec.voice_cloning, customVoiceId: spec.supports_custom_voice_id === true,
      noiseRemoval: spec.supports_background_noise_removal === true, seed: spec.supports_seed === true } : undefined,
    example: { action: 'validate', kind, model: model.id,
      ...(fileRequired ? { filePath: 'input/recording.wav' } : { prompt: 'Create a gentle, atmospheric scene with a natural rhythm.' }),
      ...(exampleOptions ? { options: exampleOptions } : {}), ...(exampleReferences && Object.keys(exampleReferences).length ? { references: exampleReferences } : {}) },
    workflow: studioWorkflow,
  }
}

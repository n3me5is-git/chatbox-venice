import type { MediaCatalogItem, MediaKind } from './media'
/** UI category differs from transport type: Venice queues several TTS models as music. */
export function mediaCategory(model: MediaCatalogItem): string {
  if (model.model_spec?.voice_changer === true) return 'voice-conversion'
  if (model.type === 'tts') return 'speech'
  if (model.type === 'asr') return 'transcription'
  if (model.type === 'music') {
    if (isSoundEffectsModel(model)) return 'sound-effects'
    const spec = model.model_spec
    if (/\btts\b|text[- ]to[- ]speech|multilingual speech/i.test(`${model.id} ${spec?.description || ''}`) || (spec?.voices?.length && !spec.supports_lyrics && !spec.supports_force_instrumental)) return 'speech'
  }
  return model.type === 'inpaint' ? 'image-edit' : model.type === 'text' ? 'chat' : model.type
}
/** Some audio generators serve both sound design and short musical clips. Transport type is unchanged. */
export function mediaCategories(model:MediaCatalogItem){const category=mediaCategory(model);return category==='music'&&model.id==='stable-audio-25'?['music','sound-effects']:[category]}
export function supportsMediaKind(model:MediaCatalogItem,kind:string){return mediaCategories(model).includes(kind)}
// Venice exposes music, effects and some asynchronous voices under type=music.
// Prefer explicit catalog categories; known catalog IDs/names cover today's untagged rows.
export function isSoundEffectsModel(model?: MediaCatalogItem) {
  const spec = model?.model_spec
  const category = String(spec?.category || spec?.audio_type || spec?.task_type || '').toLowerCase()
  if (/^(sound[-_ ]effects?|sfx)$/.test(category)) return true
  if (/^(music|song|speech|tts|voice)$/.test(category)) return false
  return model?.id === 'mmaudio-v2-text-to-audio' || /sound[-_ ]effects?|\bsfx\b/i.test(`${model?.id || ''} ${spec?.name || ''}`)
}
export function videoInputs(model?: MediaCatalogItem) {
  const c = model?.model_spec?.constraints || {}; const caps = model?.model_spec?.capabilities || {}
  const id = model?.id || ''; const type = String(c.model_type || '')
  const declared=(...values:unknown[])=>values.find((value):value is boolean=>typeof value==='boolean')
  const references = declared(c.supports_reference_images,caps.supportsReferenceImages)??/reference-to-video|omni-reference|recast/.test(id)
  const start = !references && (declared(c.image_input,caps.supportsImageInput)??type==='image-to-video')
  const end = declared(c.supports_end_image,caps.supportsEndImage)??(/first-last|first-and-last|start-end|transition/.test(id)||/^seedance-2-(?:0(?:-fast)?|5)-image-to-video-basic$/.test(id))
  return { start, end, references, video: declared(c.video_input,caps.supportsVideoInput)??/edit-video|video-to-video|recast|extend-video/.test(id),
    referenceVideos: references && (c.video_input === true || /seedance-2|wan-3/.test(id)),
    referenceAudio: references && (c.per_reference_audio === true || /seedance-2|wan-3/.test(id)),
    audioInput: c.audio_input === true, audio: c.audio_configurable === true || caps.supportsAudio === true }
}
export type VideoWorkflow = 'all' | 'text' | 'image' | 'references' | 'edit'
/** Current guide documents editing via reference_video_urls, not video_url. */
export function seedanceReferenceModel(model?:MediaCatalogItem){return !!model&&/^seedance-2-(?:0(?:-fast)?|5)-reference-to-video-basic$/.test(model.id)}
export function videoWorkflows(model:MediaCatalogItem):VideoWorkflow[]{
  if(model.type!=='video')return []
  const input=videoInputs(model),mode=String(model.model_spec?.constraints?.model_type||'')
  const workflows:VideoWorkflow[]=[]
  if(mode==='text-to-video'||/text-to-video/.test(model.id))workflows.push('text')
  if(input.start)workflows.push('image')
  if(input.references)workflows.push('references')
  if(input.video||seedanceReferenceModel(model))workflows.push('edit')
  return workflows
}
export function videoReferenceLimits(model?:MediaCatalogItem){
  if(model?.id.startsWith('seedance-2-5-'))return {images:30,videos:10,audio:10,seconds:30}
  if(model?.id.startsWith('seedance-2-0-'))return {images:9,videos:3,audio:3,seconds:15}
  return {images:4,videos:4,audio:4,seconds:undefined}
}
export interface VideoMediaSelection {
  start: boolean
  end: boolean
  sourceVideo: boolean
  sourceAudio: boolean
  images: number
  videos: number
  audio: number
}

export function acceptsVideoMedia(model: MediaCatalogItem, workflow: VideoWorkflow, media: VideoMediaSelection) {
  const inputs = videoInputs(model)
  const limits = videoReferenceLimits(model)
  const editing = workflow === 'edit' && seedanceReferenceModel(model)
  return (!media.start || inputs.start)
    && (!media.end || inputs.end)
    && (!media.sourceVideo || (inputs.video && !editing))
    && (!media.sourceAudio || inputs.audioInput)
    && media.images <= (inputs.references ? limits.images : 0)
    && media.videos <= (inputs.referenceVideos ? (editing ? 1 : limits.videos) : 0)
    && media.audio <= (inputs.referenceAudio ? limits.audio : 0)
}

export function videoWorkflowRequest(model:MediaCatalogItem|undefined,workflow:VideoWorkflow,prompt:string){
  const edit=workflow==='edit'&&seedanceReferenceModel(model)
  return {prompt:edit&&!/^Strictly edit <Video 1>/i.test(prompt)?`Strictly edit <Video 1>, ${prompt}`:prompt,
    options:edit?{aspect_ratio:'adaptive',...(model!.id.startsWith('seedance-2-5-')?{duration:'auto',omni_reference_task_type:'edit'}:{})}:{} as Record<string,unknown>}
}
export function musicDuration(model?: MediaCatalogItem) {
  const s = model?.model_spec
  return { supported: s?.min_duration !== undefined || s?.max_duration !== undefined || !!s?.duration_options?.length,
    min: s?.min_duration ?? 1, max: s?.max_duration ?? 600, default: s?.default_duration,
    choices: Array.isArray(s?.duration_options) ? s.duration_options : [] }
}
const audioFlags = {
  force_instrumental: 'supports_force_instrumental',
  lyrics_prompt: 'supports_lyrics',
  lyrics_optimizer: 'supports_lyrics_optimizer',
  loop: 'supports_loop',
  speed: 'supports_speed',
  language_code: 'supports_language_code',
} as const
export function audioQueueCapabilities(model: MediaCatalogItem) {
  const spec = model.model_spec ?? {}
  const minLyrics = /^(minimax-music-v25|minimax-music-v26)$/.test(model.id) ? 10 : model.id === 'minimax-music-v2' || spec.lyrics_required ? 1 : 0
  const duration = musicDuration(model)
  const references = spec.supports_reference_audios === true
    ? { max: Math.min(8, Math.max(1, Number(spec.max_reference_audios) || 1)), maxSeconds: 30, maxBytes: 10 * 1024 * 1024, combinedMaxBytes: 22 * 1024 * 1024 }
    : undefined
  const voices = spec.voices ?? []
  const supportedOptions = [...Object.entries(audioFlags).filter(([, flag]) => spec[flag] === true).map(([name]) => name),
    ...(duration.supported ? ['duration_seconds'] : []), ...(voices.length || spec.supports_custom_voice_id === true ? ['voice'] : []),
    ...(references ? ['reference_audio_urls'] : [])]
  return { duration, references, voices, supportedOptions, lyrics: {
    minimum: minLyrics, maximum: spec.lyrics_character_limit ?? 4096,
    optionalWithInstrumental: minLyrics === 10 && spec.supports_force_instrumental === true,
    optionalWithOptimizer: minLyrics > 0 && spec.supports_lyrics_optimizer === true && model.id !== 'minimax-music-v26',
  } }
}

export function validateAudioQuote(model: MediaCatalogItem, body: Record<string, unknown>) {
  const spec = model.model_spec ?? {}, duration = musicDuration(model)
  if (body.duration_seconds !== undefined) {
    const n = typeof body.duration_seconds === 'number' || typeof body.duration_seconds === 'string' ? Number(body.duration_seconds) : NaN
    if (!duration.supported) throw Error(`Model ${model.id} does not support duration_seconds. Omit it to use the model default.`)
    if (!Number.isSafeInteger(n) || n <= 0 || (duration.choices.length ? !duration.choices.includes(n) : n < duration.min || n > duration.max)) {
      throw Error(`Invalid duration_seconds for ${model.id}. Choose ${duration.choices.length ? duration.choices.join(', ') : `${duration.min}–${duration.max}`} seconds.`)
    }
  }
  if (body.character_count !== undefined && (!spec.pricing?.per_thousand_characters || typeof body.character_count !== 'number'
    || !Number.isSafeInteger(body.character_count) || body.character_count < 1 || spec.prompt_character_limit && body.character_count > spec.prompt_character_limit)) {
    throw Error(`Invalid character_count for ${model.id}. Only character-priced audio models accept it.`)
  }
}

function validateQueuedAudio(model: MediaCatalogItem, body: Record<string, unknown>) {
  const spec = model.model_spec ?? {}, caps = audioQueueCapabilities(model)
  const unknown = Object.keys(body).filter(key => !['model', 'prompt', ...caps.supportedOptions].includes(key) && body[key] !== undefined)
  if (unknown.length) throw Error(`Model ${model.id} does not support ${unknown.join(', ')}. Inspect the exact model in the Studio catalog.`)
  validateAudioQuote(model, body)
  for (const key of ['force_instrumental', 'lyrics_optimizer', 'loop']) {
    if (body[key] !== undefined && typeof body[key] !== 'boolean') throw Error(`${key} must be true or false.`)
  }
  if (body.speed !== undefined && (typeof body.speed !== 'number' || !Number.isFinite(body.speed) || body.speed < (spec.min_speed ?? 0.25) || body.speed > (spec.max_speed ?? 4))) {
    throw Error(`Use speed between ${spec.min_speed ?? 0.25} and ${spec.max_speed ?? 4}.`)
  }
  if (body.language_code !== undefined && (typeof body.language_code !== 'string' || !/^[a-z]{2}$/.test(body.language_code))) throw Error('language_code must be a two-letter ISO 639-1 code.')
  if (body.voice !== undefined && (typeof body.voice !== 'string' || !body.voice.trim() || !caps.voices.includes(body.voice) && spec.supports_custom_voice_id !== true)) {
    throw Error(`Choose a voice listed for ${model.id}.`)
  }
  if (body.lyrics_prompt !== undefined && typeof body.lyrics_prompt !== 'string') throw Error('lyrics_prompt must be plain text.')
  const lyrics = typeof body.lyrics_prompt === 'string' ? body.lyrics_prompt.trim() : ''
  if (lyrics && (body.lyrics_optimizer === true || body.force_instrumental === true)) throw Error('Choose one of lyrics_prompt, lyrics_optimizer or force_instrumental.')
  if (lyrics.length > caps.lyrics.maximum) throw Error(`lyrics_prompt exceeds ${caps.lyrics.maximum} characters.`)
  const lyricsWaived = caps.lyrics.optionalWithInstrumental && body.force_instrumental === true || caps.lyrics.optionalWithOptimizer && body.lyrics_optimizer === true
  if (!lyricsWaived && lyrics.length < caps.lyrics.minimum) {
    const alternatives = [caps.lyrics.optionalWithInstrumental && 'force_instrumental: true', caps.lyrics.optionalWithOptimizer && 'lyrics_optimizer: true'].filter(Boolean)
    throw Error(`Model ${model.id} requires lyrics_prompt with at least ${caps.lyrics.minimum} characters${alternatives.length ? `, or ${alternatives.join(' or ')}` : ''}.`)
  }
  if (body.reference_audio_urls !== undefined) {
    const refs = caps.references
    if (!refs || !Array.isArray(body.reference_audio_urls) || body.reference_audio_urls.length < 1 || body.reference_audio_urls.length > refs.max
      || body.reference_audio_urls.some(value => typeof value !== 'string' || !/^data:audio\/[\w.+-]+;base64,[A-Za-z0-9+/]+=*$/.test(value))) {
      throw Error(`Use up to ${refs?.max ?? 0} base64 audio clips for reference_audio_urls; HTTP URLs are not accepted.`)
    }
    if (body.voice && body.voice !== 'Describe in prompt') throw Error('Reference audio cannot be combined with a preset voice.')
  }
}
export function musicOptions(model: MediaCatalogItem | undefined, value: { seconds: number; instrumental: boolean; lyrics: string; loop?: boolean; optimizer?: boolean; voice?: string; speed?: number; language?: string }) {
  const s = model?.model_spec
  return { ...(musicDuration(model).supported && Number.isFinite(value.seconds) ? { duration_seconds: value.seconds } : {}),
    ...(s?.supports_force_instrumental === true ? { force_instrumental: value.instrumental } : {}),
    ...(s?.supports_lyrics === true && value.lyrics.trim() && !value.instrumental ? { lyrics_prompt: value.lyrics } : {}),
    ...(s?.supports_loop === true && value.loop ? { loop: true } : {}),
    ...(s?.supports_lyrics_optimizer === true && value.optimizer ? { lyrics_optimizer: true } : {}),
    ...(s?.voices?.includes(value.voice || '') ? { voice: value.voice } : {}),
    ...(s?.supports_speed === true && value.speed !== undefined ? { speed: value.speed } : {}),
    ...(s?.supports_language_code === true && value.language && value.language !== 'auto' ? { language_code: value.language } : {}) }
}
export function validateMediaRequest(kind: MediaKind, body: Record<string, unknown>, model?: MediaCatalogItem) {
  const s = model?.model_spec; if (!s) return
  if (kind === 'sound-effects' && !supportsMediaKind(model,kind)) throw new Error('Choose a sound-effects model from the Venice catalog')
  const prompt = String(kind === 'speech' && model?.type !== 'music' ? body.input ?? '' : body.prompt ?? body.input ?? '')
  if (kind === 'speech' && model?.type !== 'music' && body.prompt !== undefined && (typeof body.prompt !== 'string' || body.prompt.length > 500)) throw new Error('Voice style instructions must contain at most 500 characters.')
  if (kind === 'video' && body.negative_prompt !== undefined && (typeof body.negative_prompt !== 'string' || body.negative_prompt.length > Math.min(32000, Number(s.constraints?.prompt_character_limit) || 2500))) throw new Error('The negative prompt exceeds this model’s character limit.')
  if (!['transcription','voice-conversion'].includes(kind) && ((s.min_prompt_length && prompt.length < s.min_prompt_length) || (s.prompt_character_limit && prompt.length > s.prompt_character_limit))) throw new Error(`The prompt for this model must contain ${s.min_prompt_length || 1} to ${s.prompt_character_limit || '∞'} characters.`)
  if (kind === 'music' || kind === 'sound-effects' || kind === 'speech' && model.type === 'music') validateQueuedAudio(model, body)
  if (kind === 'video') {
    const c = s.constraints || {}; const inputs = videoInputs(model)
    const sourceMatched=seedanceReferenceModel(model)&&Array.isArray(body.reference_video_urls)&&body.reference_video_urls.length>0
    for (const [key, values] of [['duration', c.durations], ['aspect_ratio', c.aspect_ratios], ['resolution', c.resolutions]] as const) if (body[key] !== undefined && Array.isArray(values) && !values.includes(body[key])) {
      if(sourceMatched&&(key==='aspect_ratio'&&['adaptive','auto'].includes(String(body[key]))||key==='duration'&&model.id.startsWith('seedance-2-5-')&&['auto','-1'].includes(String(body[key]))))continue
      throw new Error(`${key} is not supported by this model. Open the model details.`)
    }
    for (const [key, supported] of [['image_url', inputs.start], ['end_image_url', inputs.end], ['reference_image_urls', inputs.references], ['video_url', inputs.video], ['audio', inputs.audio], ['reference_video_urls', inputs.referenceVideos], ['reference_audio_urls', inputs.referenceAudio], ['audio_url', inputs.audioInput]] as const) if (body[key] !== undefined && !supported) throw new Error(`This model does not support ${key}. Choose a compatible model.`)
    if (inputs.start && !body.image_url) throw new Error("This model requires a start image.")
    if (inputs.video && !inputs.references && !body.video_url) throw new Error("This model requires a source video.")
    if ((c.requires_end_image===true||/first-last|first-and-last|start-end|transition/.test(model.id)) && inputs.end && !body.end_image_url) throw new Error("This model requires an end frame.")
    const visualReferences=(Array.isArray(body.reference_image_urls)?body.reference_image_urls.length:0)+(Array.isArray(body.reference_video_urls)?body.reference_video_urls.length:0)
    if(inputs.references&&!visualReferences)throw new Error('Add a reference image or video for this model.')
    if(Array.isArray(body.reference_audio_urls)&&body.reference_audio_urls.length&&!visualReferences)throw new Error('Reference audio needs a reference image or video.')
    const limits=videoReferenceLimits(model)
    if(model.id.startsWith('seedance-2-'))for(const [key,max]of [['reference_image_urls',limits.images],['reference_video_urls',limits.videos],['reference_audio_urls',limits.audio]] as const)if(Array.isArray(body[key])&&(body[key] as unknown[]).length>max)throw new Error('Too many references for this model. Check the model details.')
    if(body.omni_reference_task_type!==undefined&&(!seedanceReferenceModel(model)||!model.id.startsWith('seedance-2-5-')||!['auto','reference','edit','extend'].includes(String(body.omni_reference_task_type))))throw new Error('This model does not support the selected video workflow.')
    if(body.omni_reference_task_type==='edit'&&(!sourceMatched||(body.reference_video_urls as unknown[]).length!==1))throw new Error('Video editing requires one source video.')
  }
}
export function privacyLabels(metadata?: Record<string, unknown>) {
  if (!metadata) return []
  const labels: { label: string; description: string; icon: 'private' | 'anonymous' | 'encrypted' | 'filter' }[] = []
  if (metadata.privacy === 'private') labels.push({ label: "Private", description: "Private processing declared by Venice. This does not mean E2EE.", icon: 'private' })
  if (metadata.privacy === 'anonymized' || metadata.privacy === 'anonymous') labels.push({ label: "Anonymized", description: "Venice protects your identity; the model provider may process the content.", icon: 'anonymous' })
  const caps = metadata.capabilities as Record<string, unknown> | undefined
  if (caps?.supportsTeeAttestation === true) labels.push({ label: "TEE available", description: "Supports hardware-enclave attestation. Secure text settings control verification; TEE alone does not hide prompts from Venice.", icon: 'private' })
  if (caps?.supportsE2EE === true || metadata.privacy === 'e2ee') labels.push({ label: "E2EE capable", description: "Supports end-to-end encryption. Enable secure text chat in Venice settings; this badge describes capability, not the current connection.", icon: 'encrypted' })
  const sets = [...(Array.isArray(metadata.model_sets) ? metadata.model_sets : []), ...(Array.isArray(metadata.traits) ? metadata.traits : [])]
  if (typeof metadata.uncensored === 'boolean' || sets.includes('uncensored')) labels.push({ label: metadata.uncensored === false ? "Filtered" : 'Uncensored', description: "Information from the Venice catalog; it does not change request moderation.", icon: 'filter' })
  return labels
}

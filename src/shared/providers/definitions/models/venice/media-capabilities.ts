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
export function videoWorkflowRequest(model:MediaCatalogItem|undefined,workflow:VideoWorkflow,prompt:string){
  const edit=workflow==='edit'&&seedanceReferenceModel(model)
  return {prompt:edit&&!/^Strictly edit <Video 1>/i.test(prompt)?`Strictly edit <Video 1>, ${prompt}`:prompt,
    options:edit?{aspect_ratio:'adaptive',...(model!.id.startsWith('seedance-2-5-')?{duration:'auto',omni_reference_task_type:'edit'}:{})}:{} as Record<string,unknown>}
}
export function musicDuration(model?: MediaCatalogItem) {
  const s = model?.model_spec
  return { supported: s?.min_duration !== undefined || s?.max_duration !== undefined || !!s?.duration_options?.length || !!s?.pricing?.durations,
    min: s?.min_duration ?? 1, max: s?.max_duration ?? 600, default: s?.default_duration,
    choices: Array.isArray(s?.duration_options) ? s.duration_options : [] }
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
  const prompt = String(body.prompt ?? body.input ?? '')
  if (!['transcription','voice-conversion'].includes(kind) && ((s.min_prompt_length && prompt.length < s.min_prompt_length) || (s.prompt_character_limit && prompt.length > s.prompt_character_limit))) throw new Error(`The prompt for this model must contain ${s.min_prompt_length || 1} to ${s.prompt_character_limit || '∞'} characters.`)
  if (kind === 'music' || kind === 'sound-effects') {
    for (const [key, flag] of [['force_instrumental', 'supports_force_instrumental'], ['lyrics_prompt', 'supports_lyrics'], ['lyrics_optimizer', 'supports_lyrics_optimizer'], ['loop', 'supports_loop'], ['speed', 'supports_speed'], ['language_code', 'supports_language_code']] as const) {
      if (body[key] !== undefined && s[flag] !== true) throw new Error(`Model ${model.id} does not support ${key}. Open the model details.`)
    }
    const d = musicDuration(model)
    if (body.duration_seconds !== undefined) { const n = Number(body.duration_seconds); if (!d.supported || !Number.isFinite(n) || n < d.min || n > d.max || (d.choices.length && !d.choices.includes(n))) throw new Error("This duration is not supported. Open the model details.") }
    if (s.lyrics_required && !String(body.lyrics_prompt || '').trim() && body.lyrics_optimizer !== true) throw new Error("This model requires lyrics.")
    if (s.lyrics_character_limit && String(body.lyrics_prompt || '').length > s.lyrics_character_limit) throw new Error(`Lyrics exceed ${s.lyrics_character_limit} characters.`)
    if (body.lyrics_optimizer === true && body.lyrics_prompt) throw new Error("Choose either lyrics or automatic lyrics generation.")
  }
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
    for(const [key,max]of [['reference_image_urls',limits.images],['reference_video_urls',limits.videos],['reference_audio_urls',limits.audio]] as const)if(Array.isArray(body[key])&&(body[key] as unknown[]).length>max)throw new Error('Too many references for this model. Check the model details.')
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

import type { MediaCatalogItem, MediaKind } from './media'
export function videoInputs(model?: MediaCatalogItem) {
  const c = model?.model_spec?.constraints || {}; const caps = model?.model_spec?.capabilities || {}
  const id = model?.id || ''; const type = String(c.model_type || '')
  const references = c.supports_reference_images === true || caps.supportsReferenceImages === true || /reference-to-video|omni-reference|recast/.test(id)
  const start = !references && (type === 'image-to-video' || c.image_input === true || caps.supportsImageInput === true)
  const end = c.supports_end_image === true || caps.supportsEndImage === true || /first-last|first-and-last|start-end|transition/.test(id)
  return { start, end, references, video: c.video_input === true || /edit-video|video-to-video|recast|extend-video/.test(id),
    referenceVideos: references && (c.video_input === true || /seedance-2|wan-3/.test(id)),
    referenceAudio: references && (c.per_reference_audio === true || /seedance-2|wan-3/.test(id)),
    audioInput: c.audio_input === true, audio: c.audio_configurable === true || caps.supportsAudio === true }
}
export function musicDuration(model?: MediaCatalogItem) {
  const s = model?.model_spec
  return { supported: s?.min_duration !== undefined || s?.max_duration !== undefined || !!s?.duration_options?.length || !!s?.pricing?.per_second || !!s?.pricing?.durations,
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
  const prompt = String(body.prompt ?? body.input ?? '')
  if (kind !== 'transcription' && ((s.min_prompt_length && prompt.length < s.min_prompt_length) || (s.prompt_character_limit && prompt.length > s.prompt_character_limit))) throw new Error(`Il testo per questo modello deve contenere da ${s.min_prompt_length || 1} a ${s.prompt_character_limit || '∞'} caratteri.`)
  if (kind === 'music') {
    for (const [key, flag] of [['force_instrumental', 'supports_force_instrumental'], ['lyrics_prompt', 'supports_lyrics'], ['lyrics_optimizer', 'supports_lyrics_optimizer'], ['loop', 'supports_loop'], ['speed', 'supports_speed'], ['language_code', 'supports_language_code']] as const) {
      if (body[key] !== undefined && s[flag] !== true) throw new Error(`Il modello ${model.id} non supporta ${key}. Apri la scheda del modello.`)
    }
    const d = musicDuration(model)
    if (body.duration_seconds !== undefined) { const n = Number(body.duration_seconds); if (!d.supported || !Number.isFinite(n) || n < d.min || n > d.max || (d.choices.length && !d.choices.includes(n))) throw new Error('Durata non consentita dal modello. Apri la scheda del modello.') }
    if (s.lyrics_required && !String(body.lyrics_prompt || '').trim() && body.lyrics_optimizer !== true) throw new Error('Questo modello richiede il testo della canzone.')
    if (s.lyrics_character_limit && String(body.lyrics_prompt || '').length > s.lyrics_character_limit) throw new Error(`Il testo della canzone supera ${s.lyrics_character_limit} caratteri.`)
    if (body.lyrics_optimizer === true && body.lyrics_prompt) throw new Error('Scegli testo della canzone oppure creazione automatica del testo.')
  }
  if (kind === 'video') {
    const c = s.constraints || {}; const inputs = videoInputs(model)
    for (const [key, values] of [['duration', c.durations], ['aspect_ratio', c.aspect_ratios], ['resolution', c.resolutions]] as const) if (body[key] !== undefined && Array.isArray(values) && values.length && !values.includes(body[key])) throw new Error(`${key} non consentito dal modello. Apri la scheda del modello.`)
    for (const [key, supported] of [['image_url', inputs.start], ['end_image_url', inputs.end], ['reference_image_urls', inputs.references], ['video_url', inputs.video], ['audio', inputs.audio], ['reference_video_urls', inputs.referenceVideos], ['reference_audio_urls', inputs.referenceAudio], ['audio_url', inputs.audioInput]] as const) if (body[key] !== undefined && !supported) throw new Error(`Il modello non supporta ${key}. Scegli un modello compatibile.`)
    if (inputs.start && !body.image_url) throw new Error('Questo modello richiede un’immagine iniziale.')
    if (inputs.video && !inputs.references && !body.video_url) throw new Error('Questo modello richiede un video iniziale.')
    if (inputs.end && !body.end_image_url) throw new Error('Questo modello richiede un’immagine finale.')
  }
}
export function privacyLabels(metadata?: Record<string, unknown>) {
  if (!metadata) return []
  const labels: { label: string; description: string; icon: 'private' | 'anonymous' | 'encrypted' | 'filter' }[] = []
  if (metadata.privacy === 'private') labels.push({ label: 'Privato', description: 'Elaborazione privata dichiarata da Venice. Non significa E2EE.', icon: 'private' })
  if (metadata.privacy === 'anonymized' || metadata.privacy === 'anonymous') labels.push({ label: 'Anonimizzato', description: 'Venice protegge l’identità; il fornitore del modello può elaborare i contenuti.', icon: 'anonymous' })
  const caps = metadata.capabilities as Record<string, unknown> | undefined
  if (caps?.supportsE2EE === true || metadata.privacy === 'e2ee') labels.push({ label: 'E2EE non attivo', description: 'Il modello dichiara supporto E2EE; questo client non lo implementa. La richiesta ordinaria usa HTTPS.', icon: 'encrypted' })
  const sets = [...(Array.isArray(metadata.model_sets) ? metadata.model_sets : []), ...(Array.isArray(metadata.traits) ? metadata.traits : [])]
  if (typeof metadata.uncensored === 'boolean' || sets.includes('uncensored')) labels.push({ label: metadata.uncensored === false ? 'Con filtri' : 'Uncensored', description: 'Indicazione pubblicata nel catalogo Venice; non modifica la moderazione della richiesta.', icon: 'filter' })
  return labels
}

import { mediaCategory, supportsMediaKind,validateMediaRequest } from './media-capabilities'
import { privacyAllowed, requireModelPrivacy } from './privacy'
import { v4 as uuid } from 'uuid'
import type { RequestAdapter } from '../../../../types/adapters'
import { mergeExtraBody } from '../../../../models/utils/extra-body'
import { assertVeniceEnabled, type VeniceOptions } from './options'

export type MediaKind = 'speech' | 'transcription' | 'video' | 'music' | 'sound-effects' | 'voice-conversion'
export type MediaRecord = {
  protection?:string;protectedRecord?:boolean;
  id: string; kind: MediaKind; model: string; prompt: string; createdAt: number; sessionId?: string;
  status: 'creating' | 'queued' | 'ready' | 'paused' | 'error'; queueId?: string; origin: string;
  credentialId: string; blobKey?: string; mime?: string; text?: string; error?: string; remoteCleaned?: boolean;
}
export type MediaCatalogCache = { origin: string; credentialId: string; items: MediaCatalogItem[] }
export type VoiceHandle = { id: string; model: string; name: string; origin: string; credentialId: string; createdAt: number; expiresAt: number }
export interface MediaStore {
  ensureStorage?():Promise<void>;
  putStream?(key:string,response:Response,mime:string,signal:AbortSignal):Promise<boolean>;
  readVoices?(): Promise<VoiceHandle[]>; writeVoices?(voices: VoiceHandle[]): Promise<void>;
  readCatalog?(): Promise<MediaCatalogCache | null>; writeCatalog?(cache: MediaCatalogCache): Promise<void>;
  read(): Promise<MediaRecord[]>; write(records: MediaRecord[]): Promise<void>;
  putBlob(key: string, value: string): Promise<void>; getBlob(key: string): Promise<string | null>; deleteBlob(key: string): Promise<void>;
}
export type MediaConfiguration = { apiKey: string; apiHost?: string; options: VeniceOptions }
export type MediaInput = { kind: MediaKind; model: string; prompt: string; options?: Record<string, unknown>; file?: File; sessionId?: string; signal?: AbortSignal;protection?:string;durationSeconds?:number }
export type MediaCatalogItem = { id: string; type: string; model_spec?: { name?: string; description?: string; voices?: string[]; default_voice?: string; supported_formats?: string[]; default_format?: string; constraints?: Record<string, unknown>; capabilities?: Record<string, unknown>; offline?: boolean; privacy?: string; uncensored?: boolean; traits?: string[]; model_sets?: string[]; modelSource?: string;
    pricing?: Record<string, unknown>; supports_lyrics?: boolean; lyrics_required?: boolean; supports_force_instrumental?: boolean; supports_lyrics_optimizer?: boolean; supports_loop?: boolean; supports_language_code?: boolean; supports_speed?: boolean;
    min_duration?: number; max_duration?: number; default_duration?: number; duration_options?: number[]; min_prompt_length?: number; prompt_character_limit?: number; lyrics_character_limit?: number; min_speed?: number; max_speed?: number; [key: string]: unknown } }
const MAX_BYTES = 128 * 1024 * 1024
const audioExtension=(name:string)=>{const extension=name.split('.').pop()?.toLowerCase()||'';return ({m4a:'mp4',wave:'wav',oga:'ogg'} as Record<string,string>)[extension]||extension}
const flags = { speech: 'audioEnabled', transcription: 'audioEnabled', 'voice-conversion': 'audioEnabled', video: 'videoEnabled', music: 'musicEnabled', 'sound-effects': 'musicEnabled' } as const
const queuePath = (kind: MediaKind) => kind === 'video' ? '/video' : kind === 'voice-conversion' ? '/audio/voice-changer' : '/audio'
export function mediaEnabled(kind: MediaKind, options: VeniceOptions) { return options.enabled !== false && options[flags[kind]] === true }
export function mediaOrigin(host?: string) {
  const url = new URL(host || 'https://api.venice.ai/api/v1')
  if (url.search || url.hash || url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('Venice requires HTTPS (HTTP is allowed only for a local test server)')
  return url.href.replace(/\/+$/, '')
}
export async function readMediaBytes(response: Response, maximum = MAX_BYTES): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length') || 0) > maximum) { await response.body?.cancel(); throw new Error('Media exceeds the local size limit') }
  const reader = response.body?.getReader(); if (!reader) throw new Error('Empty media response')
  const chunks: Uint8Array[] = []; let size = 0
  try { while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > maximum) throw new Error('Media exceeds the local size limit'); chunks.push(item.value) } }
  catch (error) { await reader.cancel().catch(() => {}); throw error } finally { reader.releaseLock() }
  if (!size) throw new Error('Empty media response')
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }; return bytes
}
export function mediaDataUrl(bytes: Uint8Array, mime: string) {
  let binary = ''; for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
  return `data:${mime};base64,${btoa(binary)}`
}
const abortWait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) { reject(new DOMException('Paused', 'AbortError')); return }
  const abort = () => { clearTimeout(timer); reject(new DOMException('Paused', 'AbortError')) }
  const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
  signal.addEventListener('abort', abort, { once: true })
})

export class VeniceMediaService {
  private updates: Promise<unknown> = Promise.resolve()
  private active = new Map<string, AbortController>()
  private listeners = new Set<() => void>()
  constructor(private store: MediaStore, private configuration: () => MediaConfiguration, private request: RequestAdapter['apiRequest'], private pollMs = 5000) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  list = async () => (await this.store.read()).filter(record => record && typeof record.id === 'string').sort((a, b) => b.createdAt - a.createdAt)
  isActive = (id: string) => this.active.has(id)
  private async mutate(update: (records: MediaRecord[]) => MediaRecord[]) {
    const task = this.updates.then(async () => { await this.store.write(update(await this.list())); for (const listener of this.listeners) listener() })
    this.updates = task.catch(() => {}); await task
  }
  private patch(id: string, value: Partial<MediaRecord>) { return this.mutate(records => records.map(record => record.id === id ? { ...record, ...value } : record)) }
  private config(kind?: MediaKind) {
    const config = this.configuration(); assertVeniceEnabled(config.options)
    if (!config.apiKey.trim()) throw new Error('Configure a Venice API key first')
    if (kind && !mediaEnabled(kind, config.options)) throw new Error('This Venice media module is disabled')
    return { ...config, origin: mediaOrigin(config.apiHost) }
  }
  private async credential(config: MediaConfiguration) {
    const bytes = new TextEncoder().encode(config.apiKey)
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
  }
  private async api(config: ReturnType<VeniceMediaService['config']>, path: string, body?: unknown, signal?: AbortSignal) {
    const form = body instanceof FormData
    const response = await this.request({ url: config.origin + path, method: body === undefined ? 'GET' : 'POST', useProxy: false, retry: 0, signal,
      headers: { Authorization: `Bearer ${config.apiKey}`, ...(form ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : form ? body : JSON.stringify(body) })
    if (!response.ok) { const {responseFailureReason}=await import('./failure-reason');throw new Error(`Venice ${path} failed (HTTP ${response.status}): ${await responseFailureReason(response)}. No paid request was retried.`) }
    return response
  }
  async cachedCatalog(): Promise<MediaCatalogItem[]> {
    const config = this.configuration(); if (!config.apiKey) return []
    const cache = await this.store.readCatalog?.()
    return cache && Array.isArray(cache.items) && cache.origin === mediaOrigin(config.apiHost) && cache.credentialId === await this.credential(config) ? cache.items.filter(item => privacyAllowed(item.model_spec, config.options.privacyFilter)) : []
  }
  async catalog(): Promise<MediaCatalogItem[]> {
    const config = this.config()
    const [all, tts] = await Promise.all(['/models?type=all', '/models?type=tts'].map(async path => (await this.api(config, path)).json()))
    if (!Array.isArray(all.data) || !Array.isArray(tts.data)) throw new Error('Invalid Venice model catalog')
    const merged = new Map<string, MediaCatalogItem>()
    for (const item of [...all.data, ...tts.data.map((item: MediaCatalogItem) => ({ ...item, type: 'tts' }))] as MediaCatalogItem[]) {
      if (!item || typeof item.id !== 'string' || item.model_spec?.offline || !['tts', 'asr', 'video', 'music', 'image', 'inpaint', 'embedding'].includes(item.type)) continue
      const old = merged.get(item.type + ':' + item.id)
      merged.set(item.type + ':' + item.id, { ...old, ...item, model_spec: { ...old?.model_spec, ...item.model_spec } })
    }
    const items = [...merged.values()].filter(item => privacyAllowed(item.model_spec, config.options.privacyFilter))
    await this.store.writeCatalog?.({ origin: config.origin, credentialId: await this.credential(config), items }).catch(() => {})
    return items
  }
  async quote(input: MediaInput) {
    // A quote cannot create media; inspecting prices does not enable generation.
    const config = this.config()
    if (config.options.privacyFilter && config.options.privacyFilter !== 'all') requireModelPrivacy((await this.cachedCatalog()).find(model => model.id === input.model)?.model_spec, config.options.privacyFilter)
    if (!['video', 'music', 'sound-effects', 'voice-conversion'].includes(input.kind) && !(input.kind==='speech' && (await this.cachedCatalog()).some(item=>item.id===input.model&&item.type==='music'&&mediaCategory(item)==='speech'))) throw new Error('Quotes are available for queued media models')
    const allowed = input.kind === 'video' ? ['duration', 'aspect_ratio', 'resolution', 'audio', 'video_url', 'upscale_factor'] : ['duration_seconds', 'character_count']
    const merged = mergeExtraBody({ model: input.model }, input.options || {})
    if (typeof merged.model !== 'string' || !merged.model.trim()) throw new Error('Choose a model')
    const body: Record<string, unknown> = { model: merged.model }
    requireModelPrivacy((await this.cachedCatalog()).find(model => model.id === body.model)?.model_spec, config.options.privacyFilter)
    for (const key of allowed) if (merged[key] !== undefined) body[key] = merged[key]
    if ((input.kind === 'music' || input.kind === 'sound-effects' || input.kind==='speech') && body.character_count === undefined && (await this.cachedCatalog()).find(model => model.id === body.model)?.model_spec?.pricing?.per_thousand_characters) body.character_count = input.prompt.length
    return (await this.api(config, `${queuePath(input.kind)}/quote`, body,input.signal)).json()
  }
  async start(input: MediaInput): Promise<MediaRecord> {
    input.signal?.throwIfAborted()
    const config = this.config(input.kind)
    await this.store.ensureStorage?.()
    if (!input.model.trim() || (!['transcription','voice-conversion'].includes(input.kind) && !input.prompt.trim())) throw new Error('Choose a model and enter a prompt')
    if (input.file && input.file.size > 25 * 1024 * 1024) throw new Error('Transcription file exceeds 25 MB')
    if (input.kind === 'transcription' && !input.file) throw new Error('Choose an audio or video file')
    if (input.kind === 'voice-conversion' && !input.file) throw new Error('Choose an audio recording to convert')
    const body = mergeExtraBody(input.kind === 'speech' ? { model: input.model, input: input.prompt } : { model: input.model, prompt: input.prompt }, input.options || {})
    if (typeof body.model !== 'string' || !body.model.trim()) throw new Error('The request model must be a non-empty string')
    const catalog = await this.cachedCatalog()
    const catalogMatch=catalog.find(item=>item.id===body.model)
    if(catalogMatch&&!supportsMediaKind(catalogMatch,input.kind))throw new Error('Choose a model from the selected content category')
    const known = catalog.find(item => item.id === body.model && supportsMediaKind(item,input.kind))
    const queuedSpeech=input.kind==='speech'&&known?.type==='music'
    if(queuedSpeech){body.prompt=body.input;delete body.input}
    requireModelPrivacy(known?.model_spec, config.options.privacyFilter)
    validateMediaRequest(input.kind, body, known)
    if(input.kind==='voice-conversion'&&input.durationSeconds!==undefined&&(!Number.isFinite(input.durationSeconds)||input.durationSeconds<=0||input.durationSeconds>Number(known?.model_spec?.max_source_audio_duration_seconds||300)))throw new Error('The source recording exceeds this model’s supported duration')
    const record: MediaRecord = { id: uuid(), kind: input.kind, model: String(body.model), prompt: input.prompt, createdAt: Date.now(), sessionId: input.sessionId,protection:input.protection,
      status: 'creating', origin: config.origin, credentialId: await this.credential(config) }
    await this.mutate(records => [record, ...records]); const controller = new AbortController(); this.active.set(record.id, controller)
    const onAbort = () => controller.abort()
    input.signal?.addEventListener('abort', onAbort, { once: true })
    if (input.signal?.aborted) controller.abort()
    try {
      controller.signal.throwIfAborted()
      if (queuedSpeech || ['video','music','sound-effects','voice-conversion'].includes(input.kind)) {
        let payload: Record<string, unknown> | FormData = body
        if (input.kind === 'voice-conversion') {
          if (known?.model_spec?.voice_changer !== true) throw new Error('Choose a voice-conversion model from the current Venice catalog')
          const spec = known.model_spec
          const extension = audioExtension(input.file!.name)
          if (!Array.isArray(spec.accepted_audio_formats) || !spec.accepted_audio_formats.includes(extension)) throw new Error('This recording format is not accepted by the selected model')
          const allowed = ['model','voice','remove_background_noise','seed']
          if (Object.keys(input.options || {}).some(key => !allowed.includes(key))) throw new Error('Unsupported voice-conversion option')
          if (body.remove_background_noise !== undefined && spec.supports_background_noise_removal !== true || body.seed !== undefined && spec.supports_seed !== true) throw new Error('The conversion model does not support this option')
          if (body.seed !== undefined && (typeof body.seed !== 'number' || !Number.isInteger(body.seed) || body.seed < 0 || body.seed > 4294967295)) throw new Error('The conversion seed must be an integer from 0 to 4294967295')
          if (body.voice !== undefined && !spec.voices?.includes(String(body.voice)) && spec.supports_custom_voice_id !== true) throw new Error('Choose a voice offered by the conversion model')
          payload = new FormData(); payload.set('file', input.file!); payload.set('model', String(body.model))
          for (const key of allowed.filter(key => key !== 'model')) if (body[key] !== undefined) payload.set(key, String(body[key]))
        }
        const queue = await (await this.api(config, `${queuePath(input.kind)}/queue`, payload, controller.signal)).json()
        if (typeof queue.queue_id !== 'string' || !queue.queue_id) throw new Error('Venice did not return a queue ID; do not automatically repeat the paid request')
        await this.patch(record.id, { queueId: queue.queue_id, model: typeof queue.model === 'string' ? queue.model : record.model, status: 'queued' })
        if (controller.signal.aborted) { await this.patch(record.id, { status: 'paused' }); return { ...record, queueId: queue.queue_id, status: 'paused' } }
        this.active.delete(record.id); void this.resume(record.id).catch(() => {})
      } else if (input.kind === 'speech') {
        await this.saveBinary(record.id, await this.api(config, '/audio/speech', body, controller.signal), controller.signal)
      } else {
        const form = new FormData(); form.set('file', input.file!); form.set('model', record.model); form.set('response_format', 'json')
        for (const [key, value] of Object.entries(input.options || {})) {
          if (['file', 'model', 'response_format'].includes(key) || value === undefined) continue
          for (const item of Array.isArray(value) ? value : [value]) form.append(key, typeof item === 'string' ? item : JSON.stringify(item))
        }
        const result = await (await this.api(config, '/audio/transcriptions', form, controller.signal)).json()
        if (typeof result.text !== 'string') throw new Error('Venice returned no transcription text')
        controller.signal.throwIfAborted();const bytes=new TextEncoder().encode(result.text);if(bytes.length>16*1024*1024)throw new Error('Transcription exceeds the local text size limit')
        const key='venice-media:'+record.id;let streamed=false
        try{if(bytes.length)streamed=await this.store.putStream?.(key,new Response(bytes,{headers:{'content-type':'text/plain'}}),'text/plain',controller.signal)||false
          if(streamed&&(controller.signal.aborted||!(await this.list()).some(item=>item.id===record.id))){await this.store.deleteBlob(key);controller.signal.throwIfAborted()}
          controller.signal.throwIfAborted();await this.patch(record.id,streamed?{blobKey:key,mime:'text/plain',text:undefined,status:'ready'}:{text:result.text,status:'ready'})
        }finally{bytes.fill(0)}
      }
    } catch (error) { await this.patch(record.id, { status: controller.signal.aborted ? 'paused' : 'error', error: error instanceof Error ? error.message : String(error) }) }
    finally { input.signal?.removeEventListener('abort', onAbort); if (this.active.get(record.id) === controller) this.active.delete(record.id); for (const listener of this.listeners) listener() }
    return (await this.list()).find(item => item.id === record.id) || { ...record, status: 'paused' }
  }
  private async saveBinary(id: string, response: Response, signal: AbortSignal) {
    const record = (await this.list()).find(item => item.id === id); if (!record) { await response.body?.cancel(); return }
    const mime = (response.headers.get('content-type') || '').split(';')[0].toLowerCase()
    if (!(record.kind === 'video' ? mime === 'video/mp4' : mime.startsWith('audio/'))) { await response.body?.cancel(); throw new Error('Venice returned an unexpected media type') }
    const key = 'venice-media:' + id
    const streamed = await this.store.putStream?.(key,response,mime,signal)
    if (!streamed) { const bytes = await readMediaBytes(response); signal.throwIfAborted(); await this.store.putBlob(key, mediaDataUrl(bytes, mime)); bytes.fill(0) }
    if (signal.aborted || !(await this.list()).some(item => item.id === id)) { await this.store.deleteBlob(key); signal.throwIfAborted(); return }
    await this.patch(id, { blobKey: key, mime, status: 'ready', error: undefined })
    if (!(await this.list()).some(item => item.id === id)) await this.store.deleteBlob(key)
  }
  async resume(id: string) {
    if (this.active.has(id)) return
    const record = (await this.list()).find(item => item.id === id); if (!record?.queueId) throw new Error('No stored queue ID; an interrupted paid request must not be automatically repeated')
    const config = this.config(record.kind)
    requireModelPrivacy((await this.cachedCatalog()).find(model => model.id === record.model)?.model_spec, config.options.privacyFilter)
    if (config.origin !== record.origin || await this.credential(config) !== record.credentialId) throw new Error('Resume requires the original Venice endpoint and API key')
    if (this.active.has(id)) return
    const controller = new AbortController(); this.active.set(id, controller)
    try {
      await this.patch(id, { status: 'queued', error: undefined })
      for (let attempt = 0; attempt < 240; attempt++) {
        const current = this.config(record.kind)
        if (current.origin !== record.origin || await this.credential(current) !== record.credentialId) throw new Error('Venice credentials changed; resume with the original endpoint and key')
        controller.signal.throwIfAborted()
        const response = await this.api(config, `${queuePath(record.kind)}/retrieve`, { model: record.model, queue_id: record.queueId, delete_media_on_completion: false }, controller.signal)
        if ((response.headers.get('content-type') || '').includes('application/json')) {
          const status = await response.json()
          if (['failed', 'error', 'cancelled'].includes(String(status.status).toLowerCase())) throw new Error('Venice generation failed')
          await abortWait(this.pollMs, controller.signal); continue
        }
        await this.saveBinary(id, response, controller.signal)
        if ((await this.list()).some(item => item.id === id)) await this.cleanup(id).catch(error => this.patch(id, { error: 'Saved locally; remote cleanup pending: ' + String(error) }))
        return
      }
      throw new Error('Polling paused after 20 minutes. Resume the existing job later; no new generation is needed.')
    } catch (error) { await this.patch(id, { status: controller.signal.aborted ? 'paused' : 'error', error: error instanceof Error ? error.message : String(error) }); if (!controller.signal.aborted) throw error }
    finally { this.active.delete(id); for (const listener of this.listeners) listener() }
  }
  pause(id: string) { this.active.get(id)?.abort(); return this.patch(id, { status: 'paused' }) }
  async pauseAll() { await Promise.allSettled([...this.active.keys()].map(id=>this.pause(id))) }
  async cleanup(id: string) {
    const record = (await this.list()).find(item => item.id === id); if (!record?.queueId || record.remoteCleaned) return
    const config = this.config()
    if (config.origin !== record.origin || await this.credential(config) !== record.credentialId) throw new Error('Remote cleanup requires the original endpoint and key')
    const result = await (await this.api(config, `${queuePath(record.kind)}/complete`, { model: record.model, queue_id: record.queueId })).json()
    if (result.success !== true) throw new Error('Venice did not confirm remote cleanup')
    await this.patch(id, { remoteCleaned: true, error: undefined })
  }
  async remove(id: string, remote = false) {
    this.active.get(id)?.abort()
    const record = (await this.list()).find(item => item.id === id); if (!record) return
    // Keep the record if an explicitly requested remote cleanup fails, so it can be retried.
    if (remote) await this.cleanup(id)
    if (record.blobKey) await this.store.deleteBlob(record.blobKey)
    await this.mutate(records => records.filter(item => item.id !== id))
  }
  async content(record: MediaRecord) { return record.blobKey ? this.store.getBlob(record.blobKey) : null }
  async listVoices(model?: string): Promise<VoiceHandle[]> {
    const config = this.configuration(); const credentialId = await this.credential(config); const origin = mediaOrigin(config.apiHost)
    return (await this.store.readVoices?.() || []).filter(voice => voice.origin === origin && voice.credentialId === credentialId && voice.expiresAt > Date.now() && (!model || voice.model === model))
  }
  async removeVoice(id: string) {
    // Venice currently documents expiry, not a DELETE endpoint for zero-shot voice handles.
    // Removing this reference never claims to delete the server-side sample.
    const voices = await this.store.readVoices?.() || []
    await this.store.writeVoices?.(voices.filter(voice => voice.id !== id))
  }
  async createVoice(model: string, file: File, name = '',signal?:AbortSignal) {
    signal?.throwIfAborted()
    const config = this.config('speech')
    const entry = (await this.cachedCatalog()).find(item => item.id === model && item.type === 'tts')
    requireModelPrivacy(entry?.model_spec, config.options.privacyFilter)
    const cloning = entry?.model_spec?.voice_cloning as { accepted_formats?: string[] } | undefined
    if (!cloning || !cloning.accepted_formats?.includes(audioExtension(file.name))) throw new Error('Choose a supported sample and a model with voice cloning')
    if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('Voice samples must be between 1 byte and 25 MB')
    const form = new FormData(); form.set('model', model); form.set('file', file)
    const result = await (await this.api(config, '/audio/voices', form,signal)).json()
    if (typeof result.id !== 'string' || !/^vv_[\w-]+$/.test(result.id) || result.model !== model) throw new Error('Invalid Venice voice handle')
    const details = entry?.model_spec?.voice_cloning as { retention_days?: number }
    const voice: VoiceHandle = { id: result.id, model, name: name.trim().slice(0,100) || 'My cloned voice', origin: config.origin, credentialId: await this.credential(config), createdAt: Date.now(), expiresAt: Date.now() + (Number(details.retention_days) || 7) * 86400000 }
    const voices = await this.store.readVoices?.() || []
    await this.store.writeVoices?.([...voices.filter(item => item.expiresAt > Date.now()), voice])
    return voice
  }
}

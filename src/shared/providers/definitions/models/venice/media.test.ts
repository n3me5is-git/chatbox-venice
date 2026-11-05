import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MediaConfiguration, MediaRecord, MediaStore } from './media'
import { VeniceMediaService, mediaOrigin, readMediaBytes } from './media'
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
function setup(handler: (path: string, body: unknown, signal?: AbortSignal) => Promise<Response> = async () => new Response('audio', { headers: { 'content-type': 'audio/mpeg' } })) {
  let records: MediaRecord[] = []; const blobs = new Map<string, string>()
  const config: MediaConfiguration = { apiKey: 'test-secret', options: { audioEnabled: true, videoEnabled: true, musicEnabled: true } }
  const store: MediaStore = { read: async () => structuredClone(records), write: async next => { records = structuredClone(next) }, putBlob: async (key, value) => { blobs.set(key, value) }, getBlob: async key => blobs.get(key) || null, deleteBlob: async key => { blobs.delete(key) } }
  const api = vi.fn(async (request: import('../../../../types/adapters').ApiRequestOptions) => {
    expect(request.useProxy).toBe(false); expect(request.retry).toBe(0)
    expect(request.headers?.Authorization).toBe('Bearer ' + config.apiKey)
    return handler(new URL(request.url).pathname.replace('/api/v1', ''), request.body instanceof FormData ? request.body : request.body ? JSON.parse(String(request.body)) : undefined, request.signal as AbortSignal | undefined)
  })
  const service = new VeniceMediaService(store, () => config, api, 1)
  return { service, store, config, blobs, api }
}
const services: VeniceMediaService[] = []
afterEach(() => { services.forEach(service => service.pauseAll()); services.length = 0 })
describe('Venice media lifecycle without live APIs', () => {
  it('validates secure storage before making a paid request',async()=>{const s=setup();s.store.ensureStorage=async()=>{throw new Error('Device encryption unavailable')};await expect(s.service.start({kind:'speech',model:'tts',prompt:'hello'})).rejects.toThrow('encryption');expect(s.api).not.toHaveBeenCalled();expect(await s.service.list()).toEqual([])})
  it('stores new transcriptions as lazy file references when the encrypted streaming host is available',async()=>{const s=setup(async()=>json({text:'Private transcript'}));s.store.putStream=async(key,response,mime)=>{expect(mime).toBe('text/plain');expect(await response.text()).toBe('Private transcript');s.blobs.set(key,'stored encrypted content');return true};const record=await s.service.start({kind:'transcription',model:'asr',prompt:'',file:new File(['sound'],'audio.wav')});expect(record).toMatchObject({status:'ready',mime:'text/plain'});expect(record.blobKey).toBeTruthy();expect(record.text).toBeUndefined();expect(JSON.stringify(await s.service.list())).not.toContain('Private transcript');await s.service.remove(record.id);expect(s.blobs.size).toBe(0)})

  it('keeps modules opt-in and master disable blocks all network', async () => {
    const s = setup(); s.config.options = {}; await expect(s.service.start({ kind: 'speech', model: 'tts', prompt: 'hello' })).rejects.toThrow('disabled')
    s.config.options = { enabled: false, audioEnabled: true }; await expect(s.service.catalog()).rejects.toThrow('disabled'); expect(s.api).not.toHaveBeenCalled()
  })
  it('merges live voice metadata and reads it locally without background requests', async () => {
    const s = setup(); let cache: import('./media').MediaCatalogCache | null = null
    s.store.readCatalog = async () => cache; s.store.writeCatalog = async value => { cache = value }
    s.api.mockResolvedValueOnce(json({ data: [{ id: 'tts-live', type: 'tts', model_spec: { name: 'Voice naturale' } }, { id: 'video', type: 'video' }] }))
      .mockResolvedValueOnce(json({ data: [{ id: 'tts-live', type: 'tts', model_spec: { voices: ['Sara', 'Nicola'], default_voice: 'Sara', supported_formats: ['wav'] } }] }))
    const items = await s.service.catalog()
    expect(items.find(item => item.id === 'tts-live')).toMatchObject({ model_spec: { name: 'Voice naturale', voices: ['Sara', 'Nicola'], default_voice: 'Sara' } })
    expect(await s.service.cachedCatalog()).toEqual(items); expect(s.api).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(cache)).not.toContain(s.config.apiKey)
    s.config.apiKey = 'different'; expect(await s.service.cachedCatalog()).toEqual([]); expect(s.api).toHaveBeenCalledTimes(2)
  })
  it('stores speech locally, exports only stored bytes, and removes history and blob', async () => {
    const s = setup(); const record = await s.service.start({ kind: 'speech', model: 'tts', prompt: 'hello', options: { speed: 0.8 } })
    expect(record).toMatchObject({ status: 'ready', mime: 'audio/mpeg' }); expect(await s.service.content(record)).toMatch(/^data:audio\/mpeg;base64,/)
    expect(JSON.stringify(await s.service.list())).not.toContain('test-secret'); expect(s.api).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(s.api.mock.calls[0][0].body))).toMatchObject({ model: 'tts', input: 'hello', speed: 0.8 })
    await s.service.remove(record.id); expect(await s.service.list()).toEqual([]); expect(s.blobs.size).toBe(0)
  })
  it('does not retry a failed paid POST or save response bodies in errors', async () => {
    const s = setup(async () => new Response('secret-in-body', { status: 429 }))
    const record = await s.service.start({ kind: 'speech', model: 'tts', prompt: 'hello' })
    expect(record.status).toBe('error'); expect(record.error).toContain('429'); expect(record.error).not.toContain('secret-in-body'); expect(s.api).toHaveBeenCalledTimes(1)
  })
  it('sends transcription files as multipart and retains returned text locally', async () => {
    const s = setup(async (path, body) => { expect(path).toBe('/audio/transcriptions'); expect(body).toBeInstanceOf(FormData); expect((body as FormData).get('language')).toBe('it'); return json({ text: 'Buongiorno' }) })
    const record = await s.service.start({ kind: 'transcription', model: 'asr', prompt: '', file: new File(['sound'], 'audio.wav'), options: { language: 'it' } })
    expect(record).toMatchObject({ status: 'ready', text: 'Buongiorno' })
    expect(s.api.mock.calls[0][0].headers).not.toHaveProperty('Content-Type')
  })
  it('downloads queued video and cleans remote only after local save', async () => {
    const s = setup(async (path, body) => {
      if (path === '/video/queue') return json({ queue_id: 'q1', model: 'video' })
      if (path === '/video/retrieve') { expect(body).toMatchObject({ queue_id: 'q1', delete_media_on_completion: false }); return new Response('video-bytes', { headers: { 'content-type': 'video/mp4' } }) }
      if (path === '/video/complete') { expect(s.blobs.size).toBe(1); return json({ success: true }) }
      throw new Error('Unexpected endpoint')
    })
    const record = await s.service.start({ kind: 'video', model: 'video', prompt: 'landscape' })
    await vi.waitFor(async () => expect((await s.service.list())[0]).toMatchObject({ status: 'ready', remoteCleaned: true }))
    expect(s.api.mock.calls.filter(([request]) => request.url.endsWith('/video/queue'))).toHaveLength(1)
    const restarted = new VeniceMediaService(s.store, () => s.config, s.api, 1)
    await restarted.list(); expect((await restarted.list())[0].id).toBe(record.id); expect(s.api).toHaveBeenCalledTimes(3)
  })
  it('retrieves a paused job from persistent state after restart without a new paid queue request', async () => {
    const s = setup(async path => path.endsWith('/complete') ? json({ success: true }) : new Response('media', { headers: { 'content-type': path.endsWith('/retrieve') ? 'video/mp4' : 'audio/mpeg' } }))
    const seed = await s.service.start({ kind: 'speech', model: 'tts', prompt: 'hello' })
    if (seed.blobKey) await s.store.deleteBlob(seed.blobKey)
    await s.store.write([{ ...seed, model: 'video', kind: 'video', queueId: 'saved-queue', status: 'paused', blobKey: undefined, mime: undefined }]); s.api.mockClear()
    const restarted = new VeniceMediaService(s.store, () => s.config, s.api, 1)
    await restarted.list(); expect(s.api).not.toHaveBeenCalled()
    await restarted.resume(seed.id)
    expect((await restarted.list())[0]).toMatchObject({ status: 'ready', remoteCleaned: true })
    expect(s.api.mock.calls.map(([request]) => new URL(request.url).pathname)).toEqual(['/api/v1/video/retrieve', '/api/v1/video/complete'])
  })
  it('uses the effective vendor model and options for quotes without creating a job', async () => {
    const s = setup(async (path, body) => { expect(path).toBe('/video/quote'); expect(body).toEqual({ model: 'actual-model', duration: '10s', audio: false }); return json({ quote: 1 }) })
    await s.service.quote({ kind: 'video', model: 'local-alias', prompt: 'private', options: { model: 'actual-model', duration: '10s', audio: false, prompt: 'not-in-quote' } })
    expect(s.api).toHaveBeenCalledTimes(1); expect(await s.service.list()).toEqual([])
  })
  it('does not contact a different endpoint or credential when resuming stored jobs', async () => {
    const s = setup(); const record = await s.service.start({ kind: 'speech', model: 'tts', prompt: 'hello' })
    await s.store.write([{ ...record, kind: 'video', status: 'paused', queueId: 'q1' }]); s.api.mockClear(); s.config.apiKey = 'different'
    await expect(s.service.resume(record.id)).rejects.toThrow('original'); expect(s.api).not.toHaveBeenCalled()
  })
  it('does not erase local evidence when explicitly requested remote deletion fails', async () => {
    const s = setup(async path => path.endsWith('/complete') ? json({ success: false }) : new Response('audio', { headers: { 'content-type': 'audio/mpeg' } }))
    const record = await s.service.start({ kind: 'speech', model: 'tts', prompt: 'hello' }); await s.store.write([{ ...record, kind: 'music', queueId: 'q1' }])
    await expect(s.service.remove(record.id, true)).rejects.toThrow('confirm'); expect(await s.service.list()).toHaveLength(1); expect(s.blobs.size).toBe(1)
  })
  it('never resurrects a record or leaves a blob when deleted during a save', async () => {
    const s = setup(); const originalPut = s.store.putBlob
    s.store.putBlob = async (key, data) => { await originalPut(key, data); const id = (await s.service.list())[0].id; await s.service.remove(id) }
    await s.service.start({ kind: 'speech', model: 'tts', prompt: 'hello' }); expect(await s.service.list()).toEqual([]); expect(s.blobs.size).toBe(0)
  })
  it('rejects HTML and oversized responses instead of treating them as playable media', async () => {
    const s = setup(async () => new Response('<script>bad</script>', { headers: { 'content-type': 'text/html' } }))
    expect((await s.service.start({ kind: 'speech', model: 'tts', prompt: 'hello' })).status).toBe('error'); expect(s.blobs.size).toBe(0)
    await expect(readMediaBytes(new Response('123456'), 3)).rejects.toThrow('size limit')
    await expect(readMediaBytes(new Response('', { headers: { 'content-length': '100' } }), 3)).rejects.toThrow('size limit')
  })
  it('pauses an aborted request and never automatically repeats it', async () => {
    const s = setup(async (_path, _body, signal) => new Promise((_resolve, reject) => { signal?.addEventListener('abort', () => reject(new DOMException('Paused', 'AbortError')), { once: true }) }))
    const controller = new AbortController(); const pending = s.service.start({ kind: 'speech', model: 'tts', prompt: 'hello', signal: controller.signal })
    await vi.waitFor(() => expect(s.api).toHaveBeenCalledTimes(1)); controller.abort(); expect((await pending).status).toBe('paused'); expect(s.api).toHaveBeenCalledTimes(1)
  })
  it('rejects credentials in URLs, plaintext remote transport and invalid model overrides', async () => {
    for (const host of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/?key=x']) expect(() => mediaOrigin(host)).toThrow()
    expect(mediaOrigin('http://localhost:3000')).toBe('http://localhost:3000')
    const s = setup(); await expect(s.service.start({ kind: 'speech', model: 'tts', prompt: 'hello', options: { model: false } })).rejects.toThrow('model'); expect(s.api).not.toHaveBeenCalled()
  })
})

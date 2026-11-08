import { expect,it,vi } from 'vitest'
import { SettingsSchema } from '@chatbox/core/domain/settings/settings-schema'
import { createDefaultSettings } from '@chatbox/core/domain/settings'
import { SpeechClient,speechBase,MAX_SPEECH_BYTES } from './speech-client'
import { speechBinding,type SpeechPrivacy } from './speech'
async function fixture(privacy:SpeechPrivacy='private',metadata:Record<string,unknown>|undefined={privacy:'private',voices:['sky'],default_voice:'sky',supported_formats:['pcm','mp3']}){
  const provider={id:'venice',apiHost:'https://api.venice.ai/api/v1',apiKey:'TEST_ONLY_KEY',enabled:true,audioEnabled:true}
  const binding=await speechBinding(provider.id,speechBase(provider.apiHost),provider.apiKey)
  const settings=SettingsSchema.parse({...createDefaultSettings(),defaultASRModel:{provider:'venice',model:'asr-test'},defaultTTSModel:{provider:'venice',model:'tts-test'},speechCatalog:['asr','tts'].map(kind=>({provider:'venice',model:kind+'-test',kind,name:kind,binding,metadata}))})
  const request=vi.fn(async(_options:any)=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'audio/mpeg'}})),access=vi.fn(async()=>{})
  const client=new SpeechClient({settings:()=>settings,provider:()=>provider,privacy:async()=>privacy,assertAccess:access,request})
  return {client,settings,provider,request,access}
}
it('sends real OpenAI-compatible TTS fields once and keeps the text and key out of an exposed error',async()=>{
  const f=await fixture();const result=await f.client.synthesize({sessionId:'private'},'Confidential reply',new AbortController().signal,vi.fn())
  expect(result.type).toBe('audio/mpeg');expect(result.size).toBe(3)
  expect(f.request).toHaveBeenCalledTimes(1);const request=f.request.mock.calls[0][0]
  expect(request.url).toBe('https://api.venice.ai/api/v1/audio/speech');expect(request.retry).toBe(0)
  expect(JSON.parse(request.body)).toEqual({model:'tts-test',input:'Confidential reply',voice:'sky',response_format:'mp3'})
  f.request.mockResolvedValueOnce(new Response('TEST_ONLY_KEY Confidential reply',{status:400}))
  await expect(f.client.synthesize({},'Confidential reply',new AbortController().signal,vi.fn())).rejects.toMatchObject({message:'Speech request failed (HTTP {{status}}). No automatic retry was made.',values:{status:400}})
  expect(f.request).toHaveBeenCalledTimes(2)
})
it('uploads only the chosen audio to ASR and returns editable text without calling the chat model',async()=>{
  const f=await fixture();f.request.mockResolvedValueOnce(Response.json({text:'Testo dettato'}))
  const result=await f.client.transcribe({sessionId:'one'},new File(['audio'],'voice.wav',{type:'audio/wav'}),new AbortController().signal,vi.fn())
  expect(result).toBe('Testo dettato');const request=f.request.mock.calls[0][0]
  expect(request.url).toContain('/audio/transcriptions');expect(request.body).toBeInstanceOf(FormData);expect(request.body.get('model')).toBe('asr-test');expect(request.body.get('file').name).toBe('voice.wav');expect(request.headers['Content-Type']).toBeUndefined();expect(f.request).toHaveBeenCalledTimes(1)
})
it('never contacts a non-private or unknown speech model from a private chat',async()=>{
  for(const metadata of [undefined,{privacy:'anonymous'}]){
    const f=await fixture('private',metadata),confirm=vi.fn(async()=>true)
    // Explicitly remove metadata: fixture defaults only apply when the argument is omitted.
    f.settings.speechCatalog!.forEach(model=>model.metadata=metadata)
    await expect(f.client.synthesize({},'Private',new AbortController().signal,confirm)).rejects.toThrow('disabled')
    expect(f.request).not.toHaveBeenCalled();expect(confirm).not.toHaveBeenCalled()
  }
})
it('requires E2EE downgrade consent for each request and does not send after cancellation or configuration changes',async()=>{
  const f=await fixture('e2ee'),signal=new AbortController().signal
  await expect(f.client.synthesize({},'Private',signal,async()=>false)).rejects.toMatchObject({name:'AbortError'});expect(f.request).not.toHaveBeenCalled()
  const consent=vi.fn(async()=>true);await f.client.synthesize({},'One',signal,consent);await f.client.synthesize({},'Two',signal,consent);expect(consent).toHaveBeenCalledTimes(2)
  await expect(f.client.synthesize({},'Changed',signal,async()=>{f.settings.speechOptions={voice:'different'};return true})).rejects.toThrow('changed');expect(f.request).toHaveBeenCalledTimes(2)
})
it('rejects stale credential-bound privacy claims, disabled modules and cancelled requests before sending',async()=>{
  const f=await fixture(),signal=new AbortController().signal
  f.provider.apiKey='DIFFERENT_KEY';await expect(f.client.synthesize({},'Private',signal,vi.fn())).rejects.toThrow('disabled')
  f.provider.apiKey='TEST_ONLY_KEY';f.provider.audioEnabled=false;await expect(f.client.synthesize({},'Private',signal,vi.fn())).rejects.toThrow('Enable audio')
  f.provider.audioEnabled=true;const controller=new AbortController();controller.abort();await expect(f.client.synthesize({},'Private',controller.signal,vi.fn())).rejects.toMatchObject({name:'AbortError'});expect(f.request).not.toHaveBeenCalled()
})
it('enforces output bounds and rechecks project access after receiving data',async()=>{
  const f=await fixture();f.request.mockResolvedValueOnce(new Response(new Uint8Array(MAX_SPEECH_BYTES+1),{headers:{'content-type':'audio/mpeg'}}))
  await expect(f.client.synthesize({},'Test',new AbortController().signal,vi.fn())).rejects.toThrow('size limit')
  f.request.mockImplementationOnce(async()=>{f.access.mockRejectedValueOnce(Error('Locked'));return new Response(new Uint8Array([1]),{headers:{'content-type':'audio/mpeg'}})})
  await expect(f.client.synthesize({},'Test',new AbortController().signal,vi.fn())).rejects.toThrow('Locked')
})
it('loads ASR/TTS catalog separately from chat/music and binds privacy to the active key',async()=>{
  const f=await fixture();f.request.mockResolvedValueOnce(Response.json({data:[{id:'tts-test',type:'tts',model_spec:{privacy:'private',voices:['sky']}},{id:'asr-test',type:'asr'},{id:'tts-queued',type:'music'},{id:'chat',type:'text'}]}))
  const result=await f.client.catalog('venice',new AbortController().signal);expect(result.map(model=>model.kind)).toEqual(['tts','asr']);expect(result[0].binding).toHaveLength(64);expect(JSON.stringify(result)).not.toContain('TEST_ONLY_KEY')
})

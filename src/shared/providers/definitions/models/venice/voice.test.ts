import { describe, expect, it, vi } from 'vitest'
import { VeniceMediaService, type MediaCatalogCache, type MediaConfiguration, type MediaRecord, type VoiceHandle } from './media'
const json=(data:unknown)=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}})
function fixture() {
 let records:MediaRecord[]=[];let catalog:MediaCatalogCache|null=null;let voices:VoiceHandle[]=[]
 const config:MediaConfiguration={apiKey:'simulated-key',options:{audioEnabled:true}}
 const rows=[{id:'clone',type:'tts',model_spec:{voice_cloning:{accepted_formats:['wav'],retention_days:7,min_sample_seconds:5}}},{id:'convert',type:'music',model_spec:{voice_changer:true,voices:['Aria','George'],default_voice:'Aria',accepted_audio_formats:['wav'],supports_background_noise_removal:true}}]
 const request=vi.fn(async(input:import('../../../../types/adapters').ApiRequestOptions)=>{
  const path=new URL(input.url).pathname
  if(path.includes('/models')) return json({data:path.includes('not-used')?[]:rows})
  if(path.endsWith('/audio/voices')) return json({id:'vv_sample',model:'clone'})
  if(path.endsWith('/queue')) return json({queue_id:'q1',model:'convert'})
  if(path.endsWith('/retrieve')) return new Response('audio',{headers:{'content-type':'audio/mpeg'}})
  return json({success:true})
 })
 const service=new VeniceMediaService({read:async()=>records,write:async(next)=>{records=next},readCatalog:async()=>catalog,writeCatalog:async(next)=>{catalog=next},readVoices:async()=>voices,writeVoices:async(next)=>{voices=next},putBlob:async()=>{},getBlob:async()=>null,deleteBlob:async()=>{}},()=>config,request,1)
 return {service,config,request}
}
describe('Venice native voice endpoints without paid calls',()=>{
 it('uploads a model-specific clone once, scopes saved handles and removes only the local reference',async()=>{
  const f=fixture();await f.service.catalog();f.request.mockClear()
  const voice=await f.service.createVoice('clone',new File(['sample'],'voice.wav',{type:'audio/wav'}),'My voice')
  expect(voice).toMatchObject({id:'vv_sample',model:'clone',name:'My voice'});expect(f.request).toHaveBeenCalledTimes(1)
  const request=f.request.mock.calls[0][0];expect(request.body).toBeInstanceOf(FormData);expect((request.body as FormData).get('model')).toBe('clone');expect(request.retry).toBe(0)
  expect(await f.service.listVoices('clone')).toHaveLength(1);f.config.apiKey='different';expect(await f.service.listVoices()).toHaveLength(0)
  f.config.apiKey='simulated-key';f.config.options.audioEnabled=false;expect(await f.service.listVoices()).toHaveLength(1)
  await f.service.removeVoice(voice.id);expect(await f.service.listVoices()).toHaveLength(0);expect(f.request).toHaveBeenCalledTimes(1)
 })
 it('uses the voice-changer lifecycle and saves before remote cleanup',async()=>{
  const f=fixture();await f.service.catalog();f.request.mockClear()
  const record=await f.service.start({kind:'voice-conversion',model:'convert',prompt:'',file:new File(['recording'],'source.wav',{type:'audio/wav'}),options:{voice:'George',remove_background_noise:true}})
  await vi.waitFor(async()=>expect((await f.service.list())[0]).toMatchObject({status:'ready',remoteCleaned:true}))
  const urls=f.request.mock.calls.map(([r])=>r.url);expect(urls).toEqual(expect.arrayContaining(['https://api.venice.ai/api/v1/audio/voice-changer/queue','https://api.venice.ai/api/v1/audio/voice-changer/retrieve','https://api.venice.ai/api/v1/audio/voice-changer/complete']))
  expect(urls.filter(url=>url.endsWith('/queue'))).toHaveLength(1);expect(record.kind).toBe('voice-conversion');f.service.pauseAll()
 })
 it('rejects unsupported clone formats and disabled modules before upload',async()=>{
  const f=fixture();await f.service.catalog();f.request.mockClear()
  await expect(f.service.createVoice('clone',new File(['data'],'unsupported.webm'))).rejects.toThrow('supported')
  f.config.options.audioEnabled=false;await expect(f.service.createVoice('clone',new File(['data'],'voice.wav'))).rejects.toThrow('disabled');expect(f.request).not.toHaveBeenCalled()
 })
})

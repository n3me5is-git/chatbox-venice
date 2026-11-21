import {beforeEach,expect,it,vi} from 'vitest'
import {defaultLocalMCPPermissions,LocalMCPApplicationSchema,type LocalMCPGrant} from '@shared/local-mcp'
const state=vi.hoisted(()=>({approve:vi.fn(),start:vi.fn(),getRecord:vi.fn(),media:vi.fn(),catalog:vi.fn(),rows:[] as any[],options:{} as Record<string,unknown>}))
vi.mock('@/packages/venice/service',()=>({veniceConfiguration:()=>({apiKey:'SENTINEL_KEY',options:{enabled:true,audioEnabled:true,videoEnabled:true,musicEnabled:true,showOtherModels:true,...state.options}}),veniceMediaService:{catalog:state.catalog,start:(...args:any[])=>state.media(...args),list:async()=>state.rows,listVoices:async()=>[],waitFor:vi.fn()}}))
vi.mock('@/stores/imageGenerationActions',()=>({getImageGenerationService:()=>({start:(...args:any[])=>state.start(...args),getRecord:state.getRecord})}))
vi.mock('@/packages/image-model-catalog',()=>({providerImageModelsQueryOptions:()=>({})}))
vi.mock('@/stores/queryClient',()=>({queryClient:{fetchQuery:async()=>[{modelId:'qwen-image-edit',displayName:'Qwen Image Edit',vendorMetadata:{privacy:'private'}}]}}))
vi.mock('@/packages/session-resources/files',()=>({sessionFiles:{}}))
vi.mock('@/packages/voice-file',()=>({voiceFileDuration:async()=>5,validateVoiceDuration:vi.fn()}))
vi.mock('@/packages/session-resources/service',()=>({listSessionResources:async()=>({items:[{id:'source',path:'input/ref.png',name:'ref.png',mime:'image/png'},{id:'audio',path:'input/audio.wav',name:'audio.wav',mime:'audio/wav'}]}),readSessionResource:async()=>({bytes:new Uint8Array([1,2,3])})}))
vi.mock('@/packages/vault/runtime',()=>({vaultRuntimeFor:()=>({projects:{assertSession:async()=>{},sessionScope:async()=>null},assets:{header:async()=>null}})}))
vi.mock('@/platform',()=>({default:{type:'desktop'}}))
vi.mock('./model-approval',()=>({requestExternalModelApproval:(...args:any[])=>state.approve(...args)}))
vi.mock('./temporary',()=>({temporaryMCPEntries:async()=>[],mutateTemporaryMCPEntries:vi.fn(),registerTemporaryMCPImage:vi.fn()}))
import {applicationStudioTool,lockedStudioCatalogTools} from './studio'
const grant=():LocalMCPGrant=>({running:true,sessionId:'application',endpointId:crypto.randomUUID(),application:LocalMCPApplicationSchema.parse({name:'Studio',mode:'router',providers:['venice']}),url:'http://127.0.0.1:1/mcp',token:'private-token',startedAt:1,permissions:{...defaultLocalMCPPermissions,venice:true}})
async function run(input:any,g=grant()){
 const member=applicationStudioTool(g,new AbortController().signal,async()=> 'shadow',async()=>{},async(_id,_input,work)=>work())
 const {asSchema}=await import('ai'),checked=await asSchema(member.inputSchema).validate!(input);if(!checked.success)throw Error('Invalid input');return member.execute!(checked.value,{toolCallId:'test',messages:[],context:{}})
}
beforeEach(()=>{vi.clearAllMocks();state.rows=[];state.options={};state.catalog.mockResolvedValue([{id:'asr-one',type:'asr'},{id:'tts-one',type:'tts',model_spec:{privacy:'private'}}]);state.approve.mockResolvedValue(true);state.start.mockResolvedValue({recordId:'image-one',completion:Promise.resolve(null)});state.media.mockImplementation(async()=>{const record={id:'audio-one',kind:'transcription',model:'asr-one',status:'ready',text:'Transcript',sessionId:'shadow'};state.rows=[record];return record})})
it('reads the Studio catalog during lock with normal model/privacy filters and without approvals, jobs or writes to the media cache', async () => {
  state.options = { privacyFilter: 'private', showOtherModels: false, mediaModelIds: ['asr-one', 'tts-one'] }
  const signal = new AbortController().signal
  const tools = lockedStudioCatalogTools(grant(), signal)
  const result = await tools.venice_studio.execute!({ action: 'catalog' }, { toolCallId: 'test', messages: [], context: {} })
  expect(result).toMatchObject({ images: [expect.objectContaining({ modelId: 'qwen-image-edit' })], media: [expect.objectContaining({ id: 'tts-one' })] })
  expect(JSON.stringify(result)).not.toContain('SENTINEL_KEY')
  expect(state.catalog).toHaveBeenCalledWith({ signal, refreshCache: false })
  expect(state.approve).not.toHaveBeenCalled()
  expect(state.start).not.toHaveBeenCalled()
  expect(state.media).not.toHaveBeenCalled()
})
it('describes and validates matching music options, then sends workspace audio as a base64 reference', async () => {
  state.catalog.mockResolvedValue([
    { id: 'minimax-music-v25', type: 'music', model_spec: { supports_lyrics: true, supports_lyrics_optimizer: true, supports_force_instrumental: true, min_prompt_length: 10 } },
    { id: 'supported-remix', type: 'music', model_spec: { supports_reference_audios: true, max_reference_audios: 2, duration_options: [5, 10] } },
    { id: 'invoice-tts', type: 'music', model_spec: { name: 'Voice', voices: ['Aria'] } },
  ])
  const catalog = await run({ action: 'catalog', kind: 'music' })
  expect(catalog).toMatchObject({ media: [expect.objectContaining({ id: 'minimax-music-v25' }), expect.objectContaining({ id: 'supported-remix' })] })
  const described = await run({ action: 'describe', kind: 'music', model: 'minimax-music-v25' })
  expect(described).toMatchObject({ audio: { duration: { supported: false }, lyrics: { minimum: 10, optionalWithInstrumental: true, optionalWithOptimizer: true } } })
  const draft = { kind: 'music', model: 'minimax-music-v25', prompt: 'A mellow instrumental string arrangement.' }
  await expect(run({ action: 'validate', ...draft })).rejects.toThrow('requires lyrics_prompt')
  await expect(run({ action: 'validate', ...draft, options: { duration_seconds: 5, force_instrumental: true } })).rejects.toThrow('duration_seconds')
  await expect(run({ action: 'validate', ...draft, options: { force_instrumental: true } })).resolves.toMatchObject({ valid: true })
  expect(state.approve).not.toHaveBeenCalled()
  expect(state.media).not.toHaveBeenCalled()
  const remix = { action: 'generate', kind: 'music', model: 'supported-remix', prompt: 'Rearrange @Audio1 with strings.', options: { duration_seconds: 5 }, references: { reference_audio_urls: ['input/audio.wav'] }, request_id: 'one-music-generation' }
  await expect(run(remix)).resolves.toBeDefined()
  expect(state.media).toHaveBeenCalledOnce()
  expect(state.media).toHaveBeenCalledWith(expect.objectContaining({ kind: 'music', model: 'supported-remix', options: { duration_seconds: 5, reference_audio_urls: ['data:audio/wav;base64,AQID'] } }))
})
it('uses actual reference bytes and advanced image parameters with a separate paid-operation approval',async()=>{
 expect(await run({action:'generate',kind:'image',model:'qwen-image-edit',prompt:'Edit this',options:{negative_prompt:'noise',hide_watermark:true},referencePaths:['input/ref.png'],request_id:'image'})).toMatchObject({id:'image-one',background:true})
 expect(state.start).toHaveBeenCalledWith(expect.objectContaining({prompt:'Edit this',referenceImages:['data:image/png;base64,AQID'],model:{provider:'venice',modelId:'qwen-image-edit',extraBody:{negative_prompt:'noise',hide_watermark:true}},source:expect.objectContaining({sessionId:'shadow'})}),expect.objectContaining({onRecordCreated:expect.any(Function)}))
 expect(state.approve).toHaveBeenCalledTimes(1)
})
it('does not start generation after a denial and forbids a provider outside the endpoint allowlist',async()=>{
 state.approve.mockResolvedValue(false);await expect(run({action:'generate',kind:'image',model:'qwen-image-edit',prompt:'No',request_id:'denied'})).rejects.toThrow('not approved');expect(state.start).not.toHaveBeenCalled()
 const g=grant();g.application!.providers=['openai'];await expect(run({action:'catalog'},g)).rejects.toThrow('not granted')
})
it('passes an uploaded source as a File to the existing transcription service and returns bounded metadata',async()=>{
 expect(await run({action:'generate',kind:'transcription',model:'asr-one',filePath:'input/audio.wav',request_id:'stt'})).toMatchObject({id:'audio-one',text:'Transcript'})
 expect(state.media).toHaveBeenCalledWith(expect.objectContaining({kind:'transcription',file:expect.any(File),sessionId:'shadow'}))
 expect(JSON.stringify(await run({action:'status',id:'audio-one'}))).not.toContain('SENTINEL_KEY')
})

it('waits for a background image and returns its stored provider error details', async () => {
 const image = {id:'image-one',model:{modelId:'qwen-image-edit'},source:{sessionId:'shadow'},generatedImages:[]}
 state.getRecord.mockResolvedValueOnce({...image,status:'generating'})
  .mockResolvedValueOnce({...image,status:'error',error:'Provider rejected the request',errorCode:422,errorItemUuid:'failed-output'})
 expect(await run({action:'wait',kind:'image',id:image.id,timeout_seconds:2})).toMatchObject({
  id:image.id,status:'error',error:'Provider rejected the request',errorCode:422,errorItemUuid:'failed-output',timedOut:false,count:0,
 })
 expect(state.getRecord).toHaveBeenCalledTimes(2)
 state.getRecord.mockResolvedValueOnce({...image,status:'pending'})
 expect(await run({action:'wait',kind:'image',id:image.id,timeout_seconds:0})).toMatchObject({
  status:'pending',timedOut:true,
 })
})

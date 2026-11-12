import {beforeEach,expect,it,vi} from 'vitest'
import {defaultLocalMCPPermissions,LocalMCPApplicationSchema,type LocalMCPGrant} from '@shared/local-mcp'
const state=vi.hoisted(()=>({approve:vi.fn(),start:vi.fn(),media:vi.fn(),rows:[] as any[]}))
vi.mock('@/packages/venice/service',()=>({veniceConfiguration:()=>({apiKey:'SENTINEL_KEY',options:{enabled:true,audioEnabled:true,videoEnabled:true,musicEnabled:true,showOtherModels:true}}),veniceMediaService:{catalog:async()=>[{id:'asr-one',type:'asr'},{id:'tts-one',type:'tts',model_spec:{privacy:'private'}}],start:(...args:any[])=>state.media(...args),list:async()=>state.rows,listVoices:async()=>[],waitFor:vi.fn()}}))
vi.mock('@/stores/imageGenerationActions',()=>({getImageGenerationService:()=>({start:(...args:any[])=>state.start(...args)})}))
vi.mock('@/packages/image-model-catalog',()=>({providerImageModelsQueryOptions:()=>({})}))
vi.mock('@/stores/queryClient',()=>({queryClient:{fetchQuery:async()=>[{modelId:'qwen-image-edit',displayName:'Qwen Image Edit',vendorMetadata:{privacy:'private'}}]}}))
vi.mock('@/packages/session-resources/files',()=>({sessionFiles:{}}))
vi.mock('@/packages/session-resources/service',()=>({listSessionResources:async()=>({items:[{id:'source',path:'input/ref.png',name:'ref.png',mime:'image/png'},{id:'audio',path:'input/audio.wav',name:'audio.wav',mime:'audio/wav'}]}),readSessionResource:async()=>({bytes:new Uint8Array([1,2,3])})}))
vi.mock('@/packages/vault/runtime',()=>({vaultRuntimeFor:()=>({projects:{assertSession:async()=>{},sessionScope:async()=>null},assets:{header:async()=>null}})}))
vi.mock('@/platform',()=>({default:{type:'desktop'}}))
vi.mock('./model-approval',()=>({requestExternalModelApproval:(...args:any[])=>state.approve(...args)}))
vi.mock('./temporary',()=>({temporaryMCPEntries:async()=>[],mutateTemporaryMCPEntries:vi.fn(),registerTemporaryMCPImage:vi.fn()}))
import {applicationStudioTool} from './studio'
const grant=():LocalMCPGrant=>({running:true,sessionId:'application',endpointId:crypto.randomUUID(),application:LocalMCPApplicationSchema.parse({name:'Studio',mode:'router',providers:['venice']}),url:'http://127.0.0.1:1/mcp',token:'private-token',startedAt:1,permissions:{...defaultLocalMCPPermissions,venice:true}})
async function run(input:any,g=grant()){
 const member=applicationStudioTool(g,new AbortController().signal,async()=> 'shadow',async()=>{},async(_id,_input,work)=>work())
 const {asSchema}=await import('ai'),checked=await asSchema(member.inputSchema).validate!(input);if(!checked.success)throw Error('Invalid input');return member.execute!(checked.value,{toolCallId:'test',messages:[],context:{}})
}
beforeEach(()=>{vi.clearAllMocks();state.rows=[];state.approve.mockResolvedValue(true);state.start.mockResolvedValue({recordId:'image-one',completion:Promise.resolve(null)});state.media.mockImplementation(async()=>{const record={id:'audio-one',kind:'transcription',model:'asr-one',status:'ready',text:'Transcript',sessionId:'shadow'};state.rows=[record];return record})})
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

import { beforeEach,expect,it,vi } from 'vitest'
import {defineProvider} from '@shared/providers/registry'
import {ModelProviderType} from '@shared/types'
import { RagSettingsSchema } from '@shared/session-rag'
const state=vi.hoisted(()=>({post:vi.fn(),settings:{providers:{venice:{apiKey:'test-only',apiHost:'https://api.venice.ai/api/v1'},gemini:{apiKey:'test-google',apiHost:'https://generativelanguage.googleapis.com'}}} as any}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({getSettings:()=>state.settings})}}))
vi.mock('@/utils/request',()=>({apiRequest:{post:state.post}}))
import { requestRagEmbeddings,multimodalEmbedding,embeddingMediaSupport,registerRagEmbeddingAdapter,embeddingSpaceIdentity } from './embeddings'
beforeEach(()=>{vi.clearAllMocks();defineProvider({id:'venice',name:'Venice',type:ModelProviderType.OpenAI} as any);defineProvider({id:'gemini',name:'Gemini',type:ModelProviderType.Gemini} as any)})
it('uses the configured Venice embedding endpoint, batch order and cancellation without a fallback',async()=>{
 state.post.mockResolvedValue({json:async()=>({data:[{index:1,embedding:[0,1]},{index:0,embedding:[1,0]}]})})
 const signal=new AbortController().signal,result=await requestRagEmbeddings([{text:'First'},{text:'Second'}],false,RagSettingsSchema.parse({provider:'venice',model:'embed'}),signal)
 expect(result).toEqual([[1,0],[0,1]]);expect(state.post).toHaveBeenCalledWith('https://api.venice.ai/api/v1/embeddings',expect.objectContaining({Authorization:'Bearer test-only'}),JSON.stringify({model:'embed',input:['First','Second'],encoding_format:'float'}),{signal,retry:0})
})
it('sends text and optional media directly to Gemini Embedding 2 without unsupported taskType',async()=>{
 state.post.mockResolvedValue({json:async()=>({embedding:{values:[1,2]}})})
 const cfg=RagSettingsSchema.parse({provider:'gemini',model:'gemini-embedding-2',images:true})
 await requestRagEmbeddings([{data:new Uint8Array([1,2,3]),mime:'image/png'}],false,cfg,new AbortController().signal)
 const args=state.post.mock.calls[0];expect(args[0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent');expect(JSON.parse(args[2])).toEqual({content:{parts:[{inlineData:{mimeType:'image/png',data:'AQID'}}]}})
 await requestRagEmbeddings([{text:'Question'}],true,cfg,new AbortController().signal);expect(JSON.parse(state.post.mock.calls[1][2]).content.parts[0].text).toContain('query')
 expect(multimodalEmbedding('venice','text-embedding')).toBe(false)
})
it('uses taskType only with text-only Gemini embeddings and rejects unsupported media',async()=>{
 state.post.mockResolvedValue({json:async()=>({embedding:{values:[1,2]}})})
 const cfg=RagSettingsSchema.parse({provider:'gemini',model:'gemini-embedding-001'})
 await requestRagEmbeddings([{text:'Question'}],true,cfg,new AbortController().signal);expect(JSON.parse(state.post.mock.calls[0][2]).taskType).toBe('RETRIEVAL_QUERY')
 await expect(requestRagEmbeddings([{data:new Uint8Array([1]),mime:'image/png'}],false,cfg,new AbortController().signal)).rejects.toThrow('text only')
})

it('supports explicitly registered future provider transports by modality without inferring protocols from names',async()=>{
 const request=vi.fn(async()=>[[1,0]]);state.settings.customProviders=[{id:'custom-provider-native',type:ModelProviderType.OpenAI}];state.settings.providers['custom-provider-native']={apiKey:'fixture-native',apiHost:'https://fixture.invalid'}
 const unregister=registerRagEmbeddingAdapter({id:'test-image-only',supports:provider=>provider==='custom-provider-native',modalities:['text','image'],request})
 try{expect(embeddingMediaSupport('custom-provider-native','multimodal')).toEqual({image:true,audio:false});const cfg=RagSettingsSchema.parse({provider:'custom-provider-native',model:'multimodal'});await requestRagEmbeddings([{data:new Uint8Array([1]),mime:'image/png'}],false,cfg,new AbortController().signal);expect(request).toHaveBeenCalledOnce();expect(state.post).not.toHaveBeenCalled();await expect(requestRagEmbeddings([{data:new Uint8Array([1]),mime:'audio/wav'}],false,cfg,new AbortController().signal)).rejects.toThrow('modality')}
 finally{unregister();delete state.settings.providers['custom-provider-native'];state.settings.customProviders=[]}
})
it('never advertises or sends native Venice images even if an extension claims them',async()=>{
 const request=vi.fn(async()=>[[1,0]]),unregister=registerRagEmbeddingAdapter({id:'test-venice-native',supports:provider=>provider==='venice',modalities:['image','text'],request})
 try{expect(embeddingMediaSupport('venice','gemini-embedding-2-preview')).toEqual({image:false,audio:false});await expect(requestRagEmbeddings([{data:new Uint8Array([1]),mime:'image/png'}],false,RagSettingsSchema.parse({provider:'venice',model:'gemini-embedding-2-preview'}),new AbortController().signal)).rejects.toThrow('Venice embeddings require text');expect(request).not.toHaveBeenCalled();expect(state.post).not.toHaveBeenCalled()}finally{unregister()}
})

it('binds endpoint/model/transport identity without embedding credentials into the cache identity',async()=>{
 const cfg=RagSettingsSchema.parse({provider:'venice',model:'embed'}),before=await embeddingSpaceIdentity(cfg),saved=state.settings.providers.venice.apiKey;state.settings.providers.venice.apiKey='rotated-fixture';expect(await embeddingSpaceIdentity(cfg)).toBe(before);state.settings.providers.venice.apiHost='https://other.fixture.invalid/v1';expect(await embeddingSpaceIdentity(cfg)).not.toBe(before);state.settings.providers.venice.apiHost='https://api.venice.ai/api/v1';state.settings.providers.venice.apiKey=saved
})

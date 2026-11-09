import { beforeEach,expect,it,vi } from 'vitest'
import { RagSettingsSchema } from '@shared/session-rag'
const state=vi.hoisted(()=>({post:vi.fn(),settings:{providers:{venice:{apiKey:'test-only',apiHost:'https://api.venice.ai/api/v1'},gemini:{apiKey:'test-google',apiHost:'https://generativelanguage.googleapis.com'}}} as any}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({getSettings:()=>state.settings})}}))
vi.mock('@/utils/request',()=>({apiRequest:{post:state.post}}))
import { requestRagEmbeddings,multimodalEmbedding } from './embeddings'
beforeEach(()=>vi.clearAllMocks())
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

import {expect,it,vi} from 'vitest'
import {AugmentedCollectionIndex} from './augmented'
import {KnowledgeAugmentationSchema} from '@shared/knowledge-augmentation'
import {RagSettingsSchema} from '@shared/session-rag'
import {ragHash,type RagEnginePort} from '@shared/session-rag-engine'

it('reuses encrypted-stage vectors and successful LLM windows after a later model timeout',async()=>{
 const text='Project documentation for enterprise source processing.\n'.repeat(110),bytes=new TextEncoder().encode(text),hash=await ragHash(bytes),records=new Map<string,unknown>(),embed=vi.fn(async(input:any[])=>input.map(()=>[1,0])),extract=vi.fn(async()=>({text})),analyze=vi.fn(),paths=['paper.pdf']
 const port:RagEnginePort={embeddingSpace:'a'.repeat(64),list:async()=>paths.map(path=>({path,mime:'application/pdf'})),read:async()=>Uint8Array.from(bytes),revision:async()=>hash,get:async path=>records.get(path)||null,put:async(path,value)=>{records.set(path,structuredClone(value))},remove:async path=>{records.delete(path)},check:async()=>{},embed,extract}
 const storage={get:async<T>(path:string)=>(records.get(path) as T)||null,put:async(path:string,value:unknown)=>{records.set(path,structuredClone(value))},remove:async(path:string)=>{records.delete(path)},check:async()=>{},publish:async(work:()=>Promise<void>)=>work()},pipeline=()=>new AugmentedCollectionIndex(storage,port,[{id:1,path:'paper.pdf',mime:'application/pdf'}],analyze),cfg=RagSettingsSchema.parse({provider:'private',model:'embedding'}),options=KnowledgeAugmentationSchema.parse({enabled:true,keepMarkdown:true,windowChars:2000,model:{provider:'private',model:'extractor'}})
 analyze.mockResolvedValueOnce({summary:'Valid first window',entities:[],relations:[],tags:[]}).mockRejectedValueOnce(Error('Knowledge model request timed out'))
 await expect(pipeline().index(cfg,options,new AbortController().signal,()=>{})).rejects.toThrow('timed out');expect(await pipeline().state()).toBeNull();const firstWindow=analyze.mock.calls[0][0],embedded=embed.mock.calls.length,parsed=extract.mock.calls.length;expect(embedded).toBeGreaterThan(0)
 analyze.mockResolvedValue({summary:'Other window',entities:[],relations:[],tags:[]});await pipeline().index(cfg,options,new AbortController().signal,()=>{});expect(embed).toHaveBeenCalledTimes(embedded);expect(extract).toHaveBeenCalledTimes(parsed);expect((await pipeline().state())?.metadata?.files).toHaveLength(1);expect(records.get('.chatbox/knowledge/staging.json')).toBeNull()
 // The successful first window is not billed a second time; the timed-out window is retried.
 expect(analyze.mock.calls.filter(call=>call[0]===firstWindow)).toHaveLength(1)
})

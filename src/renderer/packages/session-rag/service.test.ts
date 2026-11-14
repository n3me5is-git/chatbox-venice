// @vitest-environment jsdom
import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import {RagSettingsSchema,RAG_ROOT} from '@shared/session-rag'
const state=vi.hoisted(()=>({files:new Map<string,Uint8Array>(),local:new Map<string,any>(),locked:false,scope:undefined as string|undefined,header:vi.fn(),embed:vi.fn(),listeners:new Set<()=>void>()}))
vi.mock('@/platform',()=>({default:{type:'web'}}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({getSettings:()=>({providers:{venice:{apiKey:'fixture-key'}}})})}}))
vi.mock('@/app/renderer-application',()=>({rendererApplication:{sessions:{updateSessionHeader:state.header}}}))
vi.mock('@/packages/vault/runtime',()=>({vaultRuntimeFor:()=>({assets:{header:async()=>state.scope?{scope:state.scope}:null},projects:{sessionScope:async()=>undefined,assertSession:async()=>{if(state.locked)throw Error('Locked')}},keys:{subscribe:(fn:()=>void)=>{state.listeners.add(fn);return()=>state.listeners.delete(fn)}},db:{getSetting:async(key:string)=>state.local.get(key),setSetting:async(key:string,value:any)=>{state.local.set(key,value)}}})}))
vi.mock('@/packages/session-resources/files',()=>({resourcesChanged:vi.fn(),sessionFiles:{list:async()=>[...state.files.keys()].map(path=>({path,id:path})),read:async(_id:string,path:string)=>({bytes:state.files.get(path)!.slice()}),write:async(_id:string,path:string,bytes:Uint8Array)=>{state.files.set(path,bytes.slice())},remove:async(_id:string,path:string)=>{state.files.delete(path)},rag:vi.fn()}}))
vi.mock('@/packages/session-resources/service',()=>({listSessionResources:async()=>({items:[{path:'notes.md',key:'source-file',mime:'text/plain',bytes:12}],truncated:false}),readSessionResource:async()=>({bytes:new TextEncoder().encode('Useful notes')})}))
vi.mock('./extract',()=>({extractRagSource:async(_source:any,bytes:Uint8Array)=>({text:new TextDecoder().decode(bytes)})}))
vi.mock('./embeddings',()=>({multimodalEmbedding:()=>false,embeddingSpaceIdentity:async()=>undefined,embeddingSpaceDescriptor:()=>'',ragProvider:()=>({host:'https://api.fixture.invalid',saved:{apiKey:'fixture-key'}}),requestRagEmbeddings:(...args:any[])=>state.embed(...args)}))
import {configureRag,indexSessionRag,loadRagSettings,ragAuthorized,ragStatus,searchSessionRag,readSessionRag,assertRagIndexSources,clearSessionRag} from './service'
const cfg=()=>RagSettingsSchema.parse({enabled:true,provider:'venice',model:'embedding'})
beforeEach(()=>{vi.useFakeTimers();state.files.clear();state.local.clear();state.locked=false;state.scope=undefined;vi.clearAllMocks();state.embed.mockImplementation(async(input:any[])=>input.map(()=>[1,0]))})
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers()})
it('requires local consent after a transferred configuration, then indexes and clears only managed vectors',async()=>{
 state.files.set(RAG_ROOT+'settings.json',new TextEncoder().encode(JSON.stringify(cfg())))
 expect(await ragAuthorized('chat',await loadRagSettings('chat'))).toBe(false)
 await expect(indexSessionRag('chat')).rejects.toThrow('Enable RAG');expect(state.embed).not.toHaveBeenCalled()
 await configureRag('chat',cfg());expect(await ragAuthorized('chat',cfg())).toBe(true)
 await indexSessionRag('chat');expect((await ragStatus('chat')).index?.files[0].path).toBe('notes.md')
 expect((await searchSessionRag('chat','notes',new AbortController().signal)).matches[0].path).toBe('notes.md')
 await clearSessionRag('chat');expect([...state.files.keys()]).toEqual([RAG_ROOT+'settings.json'])
 await configureRag('chat',{...cfg(),enabled:false});await expect(searchSessionRag('chat','notes',new AbortController().signal)).rejects.toThrow('settings changed')
})
it('aborts in-flight indexing on project key changes before committing provider results',async()=>{
 await configureRag('chat',cfg());let entered!:()=>void;const started=new Promise<void>(resolve=>entered=resolve)
 state.embed.mockImplementation(async(_input,_query,_settings,signal:AbortSignal)=>{entered();return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('Locked')),{once:true}))})
 const pending=indexSessionRag('chat');await started;state.locked=true;for(const fn of state.listeners)fn()
 await expect(pending).rejects.toThrow('Locked');expect(state.files.has(RAG_ROOT+'index.json')).toBe(false);expect([...state.files.keys()].some(path=>path.includes('/data/'))).toBe(false)
})
it('reports a corrupt manifest with settings still available for clearing it',async()=>{
 await configureRag('chat',cfg());state.files.set(RAG_ROOT+'index.json',new TextEncoder().encode('{}'))
 expect(await ragStatus('chat')).toMatchObject({authorized:true,index:null,error:'Invalid RAG index'})
})

it('excludes protected sources from indexing/retrieval and rejects direct cache reads after protection changes',async()=>{
 await configureRag('chat',cfg());await indexSessionRag('chat');const result=await searchSessionRag('chat','notes',new AbortController().signal);state.scope='private';state.embed.mockClear()
 expect((await searchSessionRag('chat','notes',new AbortController().signal)).matches).toEqual([])
 await expect(readSessionRag('chat',[result.matches[0].id],new AbortController().signal)).rejects.toThrow('another privacy scope');await expect(assertRagIndexSources('chat')).rejects.toThrow('another privacy scope')
 state.embed.mockClear();await indexSessionRag('chat');expect(state.embed).not.toHaveBeenCalled();expect((await ragStatus('chat')).index?.files).toEqual([])
})

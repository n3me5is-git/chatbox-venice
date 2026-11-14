// @vitest-environment jsdom
import {beforeEach,expect,it,vi} from 'vitest'
import {emptyResourceIndex} from '@shared/session-resources'
const state=vi.hoisted(()=>({invoke:vi.fn(),access:vi.fn(),knowledge:vi.fn()}))
vi.mock('@/platform',()=>({default:{type:'desktop'}}))
vi.mock('@capacitor/core',()=>({Capacitor:{getPlatform:()=> 'web'},registerPlugin:()=>({})}))
vi.mock('@/packages/vault/runtime',()=>({vaultRuntimeFor:()=>({projects:{assertSession:state.access}})}))
vi.mock('@/packages/knowledge-collections/service',()=>({knowledgeCollections:{assert:state.knowledge}}))
import {linkedFolderOperation,mountedIndex,mountedMetadata,putMounted,readMounted,removeMounted} from './linked-folder'
beforeEach(()=>{vi.clearAllMocks();(window as any).electronAPI={invoke:state.invoke};state.invoke.mockImplementation(async(_channel,input)=>({linked:true,bindingId:'binding',...(input.action==='list'?{files:[{path:'notes.md',bytes:1,modified:10,version:'a'.repeat(64)}],directories:['docs']}:{})}))})
it('replaces the main tree while retaining only encrypted RAG sidecars and restores the managed tree on disconnect',async()=>{
 const original={...emptyResourceIndex(),files:[{id:'old',key:'encrypted:old',path:'original.md'},{id:'rag',key:'encrypted:rag',path:'.chatbox/rag/index.json'}]} as any
 const view=await mountedIndex('mount-view',original);expect(view.files.map(f=>f.path)).toEqual(['notes.md','.chatbox/rag/index.json']);expect(view.files[0].key).toContain('binding~')
 const metadata=await mountedMetadata('mount-view',{...view,directories:[...view.directories!,'new-folder']},original)
 expect(metadata.files).toEqual(original.files);expect(state.invoke).toHaveBeenCalledWith('session-folder:operation',expect.objectContaining({action:'mkdir',path:'new-folder'}))
 state.invoke.mockResolvedValue({linked:false});expect(await mountedIndex('mount-view',metadata)).toEqual(metadata)
})
it('uses binding and SHA capabilities for overwrite/read/delete and keeps index shards in vault storage',async()=>{
 const key='linked:capability:notes.md:binding~'+'a'.repeat(64),file={path:'notes.md'} as any
 state.invoke.mockImplementation(async(_channel,input)=>({linked:true,bindingId:'binding',version:'b'.repeat(64),...(input.action==='read'?{base64:'SGk='}:{})}))
 expect(await putMounted('capability',new Uint8Array([1]),file,key)).toMatchObject({id:'linked-file:notes.md'})
 expect(state.invoke).toHaveBeenCalledWith('session-folder:operation',expect.objectContaining({action:'write',bindingId:'binding',expectedVersion:'a'.repeat(64)}))
 expect(new TextDecoder().decode((await readMounted(key))!)).toBe('Hi');await removeMounted(key)
 expect(await putMounted('capability',new Uint8Array(),{path:'.chatbox/rag/data/file.json'} as any)).toBeNull()
 state.access.mockRejectedValueOnce(Error('Locked'));await expect(readMounted(key)).rejects.toThrow('Locked')
})

it('rejects malformed native capabilities instead of reading without a hash check',async()=>{
 await expect(readMounted('linked:capability:notes.md:binding')).rejects.toThrow('Invalid linked file version');expect(state.invoke).not.toHaveBeenCalled()
})

it('authorizes knowledge folder identities as collections rather than fabricated chats',async()=>{state.knowledge.mockRejectedValueOnce(Error('Collection locked'));await expect(linkedFolderOperation({sessionId:'knowledge-1',action:'list'})).rejects.toThrow('Collection locked');expect(state.knowledge).toHaveBeenCalledWith(-1);expect(state.access).not.toHaveBeenCalled();expect(state.invoke).not.toHaveBeenCalled();await expect(linkedFolderOperation({sessionId:'knowledge-0',action:'list'})).rejects.toThrow('Invalid knowledge collection')})

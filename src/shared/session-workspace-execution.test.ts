import { expect,it,vi } from 'vitest'
import { SessionFileStore } from './session-file-store'
import type { SessionResourceIndex } from './session-resources'
import { executeSessionCode } from './session-workspace-execution'
const signal=()=>new AbortController().signal
function fixture(){
  const indices=new Map<string,SessionResourceIndex>(),data=new Map<string,Uint8Array>()
  const store=new SessionFileStore({assertAccess:async()=>{},loadIndex:async id=>indices.get(id)||null,saveIndex:async(id,index)=>{indices.set(id,structuredClone(index))},read:async key=>data.get(key)!.slice(),put:async(_id,key,bytes)=>{data.set(key,bytes.slice())},remove:async key=>{data.delete(key)}})
  return {store,data}
}
it('passes only selected files to execution and commits successful outputs without delivering intermediates',async()=>{
  const {store}=fixture();await store.write('one','input.txt',new TextEncoder().encode('input'));await store.write('one','other.txt',new TextEncoder().encode('secret'));await store.write('two','unrelated.txt',new Uint8Array([1]))
  const execute=vi.fn(async(_code:string,files:unknown)=>{expect(Object.keys(files as object)).toEqual(['input.txt']);return {stdout:'done',files:{'output.md':{base64:btoa('# Output')}}}})
  expect(await executeSessionCode(store,{execute},'one','code',['input.txt'],signal())).toMatchObject({exitCode:0,files:['output.md']})
  expect((await store.list('one')).find(file=>file.path==='output.md')?.deliverable).toBe(false)
  expect(await store.list('two')).toHaveLength(1)
})
it('rejects stale execution changes, cancellation and disabled tools without overwriting user edits',async()=>{
  const {store}=fixture();await store.write('one','a.txt',new Uint8Array([1]))
  const execute=async()=>{await store.write('one','a.txt',new Uint8Array([2]));return {stdout:'',files:{'a.txt':{base64:btoa('stale')},'new.txt':{base64:btoa('new')}}}}
  await expect(executeSessionCode(store,{execute},'one','code',['a.txt'],signal())).rejects.toThrow('changed')
  expect((await store.read('one','a.txt')).bytes).toEqual(new Uint8Array([2]));expect(await store.list('one')).toHaveLength(1)
  await store.tools('one',false);await expect(executeSessionCode(store,{execute},'one','code',[],signal())).rejects.toThrow('disabled')
  await store.tools('one',true);const abort=new AbortController();abort.abort();await expect(executeSessionCode(store,{execute},'one','code',[],abort.signal)).rejects.toThrow()
})
it('does not commit errored or malformed runtime output',async()=>{
  const {store}=fixture()
  expect(await executeSessionCode(store,{execute:async()=>({stdout:'',error:'failed',files:{'bad.txt':{base64:btoa('bad')}}})},'one','code',[],signal())).toMatchObject({exitCode:1,files:[]})
  await expect(executeSessionCode(store,{execute:async()=>({stdout:'',files:{'../bad':{base64:btoa('bad')}}})},'one','code',[],signal())).rejects.toThrow()
  expect(await store.list('one')).toEqual([])
})

it('does not pass derived RAG cache bytes into the JavaScript or Python runtime',async()=>{
 const {store}=fixture(),execute=vi.fn();await expect(executeSessionCode(store,{execute},'one','code',['.chatbox/rag/data/index.json'],signal())).rejects.toThrow('managed by the app');expect(execute).not.toHaveBeenCalled()
})

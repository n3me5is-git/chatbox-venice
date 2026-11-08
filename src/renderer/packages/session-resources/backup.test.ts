import { expect,it,vi } from 'vitest'
import { SessionFileStore } from '@shared/session-file-store'
import type { SessionResourceIndex } from '@shared/session-resources'
import { EncryptedChunkStore,type AssetHeader,type AssetIndex } from '@/packages/vault/chunk-store'
import { aesKey } from '@/packages/vault/crypto'
const state=vi.hoisted(()=>({vault:undefined as any,store:undefined as any,exported:undefined as Blob|undefined}))
vi.mock('@/platform',()=>({default:{exporter:{exportStreamingFile:async(_name:string,source:()=>AsyncIterable<Uint8Array>)=>{const chunks:Uint8Array<ArrayBuffer>[]=[];for await(const bytes of source())chunks.push(Uint8Array.from(bytes));state.exported=new Blob(chunks);return {boundedMemory:true}}}}}))
vi.mock('@/packages/vault/runtime',()=>({vaultRuntimeFor:()=>state.vault}))
vi.mock('./files',()=>({sessionFiles:{list:(id:string)=>state.store.list(id),adopt:(id:string,files:any)=>state.store.adopt(id,files)},resourcesChanged:vi.fn()}))
import { exportSessionWorkspace,restoreSessionWorkspace } from './backup'
async function fixture(){
  const bytes=new Map<string,string>(),headers=new Map<string,AssetHeader>(),indices=new Map<string,SessionResourceIndex>(),key=await aesKey(crypto.getRandomValues(new Uint8Array(32)))
  const index:AssetIndex={get:async id=>headers.get(id)||null,byAlias:async alias=>[...headers.values()].find(header=>header.alias===alias)||null,put:async header=>{headers.set(header.id,structuredClone(header))},remove:async id=>{headers.delete(id)},page:async()=>({items:[...headers.values()],next:null}),all:async function*(){yield* [...headers.values()]}}
  const legacy={get:async(id:string)=>bytes.get(id)||null,set:async(id:string,value:string)=>{bytes.set(id,value)},remove:async(id:string)=>{bytes.delete(id)},keys:async()=>[...bytes.keys()]}
  const assets=new EncryptedChunkStore(legacy,index,async()=>key)
  const store=new SessionFileStore({assertAccess:async()=>{},loadIndex:async id=>indices.get(id)||null,saveIndex:async(id,index)=>{indices.set(id,structuredClone(index))},read:async ref=>{const parts:Uint8Array[]=[];for await(const part of assets.read(ref))parts.push(part);return Uint8Array.from(parts.flatMap(part=>[...part]))},put:async(id,key,data,file)=>{await assets.put((async function*(){yield data.length?data:new Uint8Array([0])})(),{kind:'document',name:file.name,mime:file.mime,sessionId:id,resourcePath:file.path,deliverable:file.deliverable,logicalBytes:file.bytes},'public',key)},remove:ref=>assets.remove(ref)})
  state.vault={assets,legacy,projects:{assertSession:async()=>{},sessionScope:async()=>undefined},keys:{key:async()=>key}};state.store=store
  return {store,bytes,headers,assets}
}
it('backs up intermediate scripts and empty files; restores encrypted copies without replacing existing paths',async()=>{
  const original=await fixture();await original.store.write('one','report.md',new TextEncoder().encode('# Confidential report'),{deliverable:true});await original.store.write('one','script.js',new TextEncoder().encode('console.log(1)'));await original.store.write('one','empty.txt',new Uint8Array())
  await exportSessionWorkspace('one','a long workspace passphrase',new AbortController().signal)
  const archive=state.exported!;expect(await archive.text()).not.toContain('Confidential');expect(await archive.text()).not.toContain('script.js')
  const target=await fixture();await target.store.write('target','report.md',new TextEncoder().encode('Keep my existing file'))
  expect(await restoreSessionWorkspace('target',archive,'a long workspace passphrase',new AbortController().signal)).toBe(3)
  const files=await target.store.list('target');expect(files).toHaveLength(4);expect(new TextDecoder().decode((await target.store.read('target','report.md')).bytes)).toBe('Keep my existing file')
  expect(files.find(file=>file.path.endsWith('/report.md'))?.deliverable).toBe(true);expect(files.find(file=>file.path==='script.js')?.deliverable).toBe(false)
  expect((await target.store.read('target','empty.txt')).bytes.length).toBe(0)
  expect([...target.bytes.values()].join('')).not.toContain('Confidential');expect(target.headers.size).toBe(4)
})
it('publishes no files or aliases after a wrong passphrase or cancelled import',async()=>{
  const original=await fixture();await original.store.write('one','report.md',new TextEncoder().encode('Sensitive'))
  await exportSessionWorkspace('one','a long workspace passphrase',new AbortController().signal);const archive=state.exported!
  const target=await fixture();await expect(restoreSessionWorkspace('target',archive,'incorrect workspace passphrase',new AbortController().signal)).rejects.toThrow()
  const controller=new AbortController();controller.abort();await expect(restoreSessionWorkspace('target',archive,'a long workspace passphrase',controller.signal)).rejects.toThrow()
  expect(await target.store.list('target')).toEqual([]);expect(target.headers.size).toBe(0);expect(target.bytes.size).toBe(0)
})

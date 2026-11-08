import { describe,expect,it } from 'vitest'
import { EncryptedChunkStore, VaultLockedError, type AssetHeader, type AssetIndex } from './chunk-store'
import { aesKey } from './crypto'
function fixture(){
 const values=new Map<string,string>();const headers=new Map<string,AssetHeader>();const keys=new Map<string,CryptoKey>()
 const index:AssetIndex={get:async id=>structuredClone(headers.get(id)||null),byAlias:async alias=>structuredClone([...headers.values()].find(header=>header.alias===alias&&header.status==='ready')||null),put:async header=>{headers.set(header.id,structuredClone(header))},remove:async id=>{headers.delete(id)},page:async()=>({items:[...headers.values()],next:null}),all:async function*(){yield* [...headers.values()].map(header=>structuredClone(header))}}
 const store=new EncryptedChunkStore({get:async key=>values.get(key)||null,set:async(key,value)=>{values.set(key,value)},remove:async key=>{values.delete(key)},keys:async()=>[...values.keys()]},index,async scope=>{const key=keys.get(scope);if(!key)throw new VaultLockedError(scope);return key})
 return {store,values,headers,keys,index}
}
const info={name:'Private title',mime:'audio/wav',kind:'audio' as const,prompt:'Sensitive prompt'}
describe('authenticated media stored in bounded encrypted chunks',()=>{
 it('updates encrypted metadata without rewriting bytes and refuses metadata changes after locking',async()=>{
  const f=fixture();f.keys.set('public',await aesKey(crypto.getRandomValues(new Uint8Array(32))))
  const ref=await f.store.put((async function*(){yield new Uint8Array([1,2,3])})(),info),before=[...f.values.entries()]
  await f.store.describe(ref,{...info,name:'Final report',deliverable:true});expect([...f.values.entries()]).toEqual(before)
  expect(await f.store.info((await f.store.header(ref))!)).toMatchObject({name:'Final report',deliverable:true})
  expect(JSON.stringify([...f.headers.values()])).not.toContain('Final report');f.keys.delete('public')
  await expect(f.store.describe(ref,{...info,hidden:true})).rejects.toBeInstanceOf(VaultLockedError)
 })
 it('cleans expired encrypted backup stages while retaining an active import and unrelated files',async()=>{const f=fixture(),old='00000000-0000-4000-8000-000000000001',active='00000000-0000-4000-8000-000000000002';f.values.set('vault-backup-lease-'+old,JSON.stringify({updatedAt:Date.now()-86400001}));f.values.set('vault-backup-stage-'+old+'-0','old ciphertext');f.values.set('vault-backup-lease-'+active,JSON.stringify({updatedAt:Date.now()}));f.values.set('vault-backup-stage-'+active+'-0','active ciphertext');expect(await f.store.cleanupOrphans()).toBe(1);expect(f.values.has('vault-backup-stage-'+old+'-0')).toBe(false);expect(f.values.has('vault-backup-stage-'+active+'-0')).toBe(true)})
 it('does not publish a download after its protection key has been locked',async()=>{const f=fixture();f.keys.set('private',await aesKey(crypto.getRandomValues(new Uint8Array(32))));async function* source(){yield new Uint8Array([1,2,3]);f.keys.delete('private')}await expect(f.store.put(source(),info,'private','saved')).rejects.toBeInstanceOf(VaultLockedError);expect(f.headers.size).toBe(0);expect(f.values.size).toBe(0)})
 it('writes ciphertext before requesting the next chunk, authenticates sizes, and reconstructs the original data',async()=>{
  const f=fixture();f.keys.set('public',await aesKey(crypto.getRandomValues(new Uint8Array(32))))
  async function* source(){yield new Uint8Array(1024*1024).fill(7);expect(f.values.size).toBe(1);yield new Uint8Array(1024*1024).fill(8);expect(f.values.size).toBe(2);yield new Uint8Array(17).fill(9)}
  const ref=await f.store.put(source(),info,'public','legacy-key');const header=(await f.store.header(ref))!
  expect(header.bytes).toBe(2*1024*1024+17);expect(header.chunks).toBe(3);expect(await f.store.info(header)).toEqual(info)
  expect(JSON.stringify([...f.headers.values()])).not.toContain('Sensitive prompt');expect(JSON.stringify([...f.values.values()])).not.toContain('Sensitive prompt')
  const chunks=[];for await(const bytes of f.store.read('legacy-key'))chunks.push(bytes)
  expect(chunks.map(bytes=>[bytes.length,bytes[0]])).toEqual([[1048576,7],[1048576,8],[17,9]])
 })
 it('detects ciphertext changes and manifest truncation',async()=>{
  const f=fixture();f.keys.set('public',await aesKey(crypto.getRandomValues(new Uint8Array(32))))
  const ref=await f.store.put((async function*(){yield new Uint8Array(1024*1024+1).fill(5)})(),info)
  const header=(await f.store.header(ref))!;await f.index.put({...header,chunks:1,bytes:1048576})
  await expect(f.store.read(ref).next()).rejects.toThrow('manifest')
  await f.index.put(header);const key=[...f.values.keys()][0];const sealed=JSON.parse(f.values.get(key)!);sealed.data=sealed.data.slice(0,-4)+'AAAA';f.values.set(key,JSON.stringify(sealed))
  await expect(f.store.read(ref).next()).rejects.toThrow()
 })
 it('rewraps a file without rewriting its bytes and refuses a locked project before reading content',async()=>{
  const f=fixture();f.keys.set('public',await aesKey(crypto.getRandomValues(new Uint8Array(32))));f.keys.set('project',await aesKey(crypto.getRandomValues(new Uint8Array(32))))
  const ref=await f.store.put((async function*(){yield new Uint8Array([1,2,3])})(),info);const stored=[...f.values.entries()]
  await f.store.rewrap(ref,'project');expect([...f.values.entries()]).toEqual(stored);f.keys.delete('project')
  await expect(f.store.read(ref).next()).rejects.toBeInstanceOf(VaultLockedError)
 })
 it('cleans an aborted download and does not confuse unrelated blobs with orphaned chunks',async()=>{
  const f=fixture();f.keys.set('public',await aesKey(crypto.getRandomValues(new Uint8Array(32))));const abort=new AbortController()
  await expect(f.store.put((async function*(){yield new Uint8Array(1048576);abort.abort();yield new Uint8Array([1])})(),info,'public',undefined,abort.signal)).rejects.toThrow()
  expect(f.headers.size).toBe(0);expect(f.values.size).toBe(0);f.values.set('unrelated-chat-blob','keep');f.values.set('vault-v1-00000000-0000-4000-8000-000000000000-chunk-0','orphan')
  expect(await f.store.cleanupOrphans()).toBe(1);expect(f.values.get('unrelated-chat-blob')).toBe('keep')
 })
})

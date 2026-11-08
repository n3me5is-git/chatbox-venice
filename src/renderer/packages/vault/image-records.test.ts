import { describe,expect,it } from 'vitest'
import type { ImageGeneration } from '@shared/types'
import type { ImageGenerationStorage } from '@/storage/ImageGenerationStorage'
import { EncryptedChunkStore,VaultLockedError,type AssetHeader,type AssetIndex } from './chunk-store'
import { aesKey } from './crypto'
import { ProtectedImageRecords } from './image-records'
import type { VaultRuntime } from './runtime'
async function fixture(){
 const originalRows=new Map<string,ImageGeneration>(),headers=new Map<string,AssetHeader>(),values=new Map<string,string>();let locked=false;const publicKey=await aesKey(crypto.getRandomValues(new Uint8Array(32))),privateKey=await aesKey(crypto.getRandomValues(new Uint8Array(32)))
 const original:ImageGenerationStorage={initialize:async()=>{},create:async record=>{originalRows.set(record.id,structuredClone(record))},getById:async id=>structuredClone(originalRows.get(id)||null),update:async(id,updates)=>{const record=originalRows.get(id);if(!record)return null;const next={...record,...updates};originalRows.set(id,structuredClone(next));return next},delete:async id=>{originalRows.delete(id)},getPage:async()=>({items:[...originalRows.values()],nextCursor:null,total:originalRows.size}),getTotal:async()=>originalRows.size}
 const index:AssetIndex={get:async id=>headers.get(id)||null,byAlias:async alias=>[...headers.values()].find(item=>item.alias===alias&&item.status==='ready')||null,put:async h=>{headers.set(h.id,structuredClone(h))},remove:async id=>{headers.delete(id)},page:async()=>({items:[],next:null}),all:async function*(){yield* [...headers.values()]}}
 const key=async(scope:string)=>{if(scope!=='public'&&locked)throw new VaultLockedError(scope);return scope==='public'?publicKey:privateKey}
 const assets=new EncryptedChunkStore({get:async key=>values.get(key)||null,set:async(key,value)=>{values.set(key,value)},remove:async key=>{values.delete(key)},keys:async()=>[...values.keys()]},index,key)
 const vault={assets,keys:{key,isUnlocked:(scope:string)=>scope==='public'||!locked},find:(ref:string)=>assets.header(ref),migrate:async()=>false} as unknown as VaultRuntime
 return {store:new ProtectedImageRecords(original,vault),originalRows,assets,headers,values,lock:()=>{locked=true},unlock:()=>{locked=false}}
}
const record=():ImageGeneration=>({id:crypto.randomUUID(),createdAt:1,prompt:'Sensitive portrait prompt',model:{provider:'venice',modelId:'test-image'},referenceImages:[],generatedImages:[],status:'done',error:'Sensitive error details',taskId:'saved-job'})
describe('protected image session metadata',()=>{
 it('recovers the protected scope lost by older Android rows, including after a restart',async()=>{
  const f=await fixture(),image=record();await f.store.create(image);await f.store.update(image.id,{protection:'app'})
  const raw=f.originalRows.get(image.id)!;delete raw.protection;delete raw.protectedRecord;f.lock()
  expect((await f.store.getPage(0)).items[0]).toMatchObject({protection:'app',protectedRecord:true,prompt:''})
  await expect(f.store.update(image.id,{protection:undefined})).rejects.toBeInstanceOf(VaultLockedError)
  f.unlock();expect(await f.store.getById(image.id)).toMatchObject({prompt:image.prompt,protection:'app'})
  await f.store.update(image.id,{protection:undefined})
  expect((await f.store.getPage(0)).items[0]).toMatchObject({prompt:image.prompt,protection:undefined,protectedRecord:false})
  expect(await f.assets.header('vault-image-record-'+image.id)).toBeNull()
 })
 it('moves image history and image bytes between scopes in both directions repeatedly',async()=>{
  const f=await fixture(),image=record();await f.assets.put((async function*(){yield new Uint8Array([1,2,3])})(),{name:'Saved',kind:'image',mime:'image/png'},'public','saved-image')
  image.generatedImages=['saved-image'];await f.store.create(image)
  for(const protection of ['app',undefined,'app',undefined]){await f.store.update(image.id,{protection});const rows=(await f.store.getPage(0)).items;expect(rows.filter(row=>!!row.protection)).toHaveLength(protection?1:0);expect(rows.filter(row=>!row.protection)).toHaveLength(protection?0:1);expect((await f.assets.header('saved-image'))?.scope).toBe(protection||'public');expect(rows[0].generatedImages).toEqual(['saved-image'])}
 })
 it('encrypts prompts and error details, rewraps existing image bytes, and redacts history while locked',async()=>{const f=await fixture();const image=record();await f.assets.put((async function*(){yield new Uint8Array([1,2,3])})(),{name:'Image',kind:'image',mime:'image/png'},'public','saved-image');image.generatedImages=['saved-image'];await f.store.create(image);const imageChunks=[...f.values.entries()];await f.store.update(image.id,{protection:'app'});const raw=f.originalRows.get(image.id)!;expect(raw.prompt).toBe('');expect(raw.error).toBeUndefined();expect(raw.taskId).toBeUndefined();expect(JSON.stringify(raw)).not.toContain('Sensitive');for(const [key,value] of imageChunks)expect(f.values.get(key)).toBe(value);f.lock();expect(await f.store.getById(image.id)).toMatchObject({protectedRecord:true,prompt:'',generatedImages:[]});expect((await f.store.getPage(0)).items[0].prompt).toBe('');await expect(f.assets.read('saved-image').next()).rejects.toBeInstanceOf(VaultLockedError);await expect(f.store.update(image.id,{prompt:'Change'})).rejects.toBeInstanceOf(VaultLockedError);f.unlock();expect((await f.store.getById(image.id))?.prompt).toBe(image.prompt);await f.store.update(image.id,{protection:undefined});expect(f.originalRows.get(image.id)?.prompt).toBe(image.prompt);expect((await f.assets.header('saved-image'))?.scope).toBe('public')})
 it('keeps ordinary sessions intact when protection cannot be completed',async()=>{const f=await fixture();const image=record();image.generatedImages=['https://remote.example/image.png'];await f.store.create(image);await expect(f.store.update(image.id,{protection:'app'})).rejects.toThrow('Save generated images');expect(f.originalRows.get(image.id)).toEqual(image);expect(await f.assets.header('vault-image-record-'+image.id)).toBeNull()})
 it('creates a protected pending record without writing its prompt to the ordinary database',async()=>{const f=await fixture();const image={...record(),protection:'app',status:'pending' as const};await f.store.create(image);expect(f.originalRows.get(image.id)).toMatchObject({prompt:'',protectedRecord:true,status:'done'});expect(await f.store.getById(image.id)).toMatchObject({prompt:image.prompt,status:'pending'});f.lock();await expect(f.store.delete(image.id)).rejects.toBeInstanceOf(VaultLockedError)})
})

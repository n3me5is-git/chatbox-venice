import 'fake-indexeddb/auto'
import {expect,it,vi} from 'vitest'
import {VaultDatabase} from '@/packages/vault/database'
import {VaultKeys} from '@/packages/vault/keys'
import {EncryptedChunkStore} from '@/packages/vault/chunk-store'
import type {VaultRuntime} from '@/packages/vault/runtime'
import {RagSettingsSchema} from '@shared/session-rag'
import {KnowledgeCollections} from './store'

async function fixture(){
 const blobs=new Map<string,string>(),envelopes=new Map<string,string>(),db=new VaultDatabase('kb-'+crypto.randomUUID()),device={capabilities:async()=>({encryption:true,biometric:true,name:'Test device'}),protect:async(value:string)=>{const id=crypto.randomUUID();envelopes.set(id,value);return id},unprotect:async(id:string)=>{const value=envelopes.get(id);if(!value)throw Error('Missing device key');return value}},keys=new VaultKeys(db,device)
 const assets=new EncryptedChunkStore({get:async key=>blobs.get(key)||null,set:async(key,value)=>{blobs.set(key,value)},remove:async key=>{blobs.delete(key)},keys:async()=>[...blobs.keys()]},db,scope=>keys.key(scope))
 const vault={db,keys,assets,projects:{assertApp:async()=>{}},available:async()=>{await keys.key('public');return true}} as unknown as VaultRuntime
 const embed=vi.fn(async(inputs:{text?:string}[])=>inputs.map(input=>input.text?.includes('cat')?[0,1]:[1,0])),unlock=vi.fn(async(scope:string)=>{await keys.unlock(scope,'pin','123456');return true}),store=new KnowledgeCollections(vault,{extract:async(_source,bytes)=>({text:new TextDecoder().decode(bytes)}),embed,validate:()=>{},unlock})
 const cfg=RagSettingsSchema.parse({provider:'venice',model:'embedding',enabled:true}),id=await store.create('Company secrets',cfg)
 const add=async(name='manual.txt',text='Confidential payment instructions.')=>{const bytes=new TextEncoder().encode(text);return store.add(id,{name,type:'text/plain',size:bytes.length,arrayBuffer:async()=>bytes.buffer} as File)}
 return {blobs,db,keys,store,embed,unlock,cfg,id,add}
}
it('encrypts filenames, passages and vectors, and searches the same collection across chat callers',async()=>{
 const f=await fixture();await f.add();await f.store.index(f.id);expect(JSON.stringify([...f.blobs])).not.toContain('Confidential');expect(JSON.stringify(await f.db.getSetting('knowledge-collections:v1'))).not.toContain('Company secrets')
 expect((await f.store.search(f.id,'payment')).matches).toHaveLength(1);expect((await f.store.search(f.id,'payment')).matches[0].snippet).toContain('Confidential')
 const list=await f.store.data(f.id);expect(list.files[0].name).toBe('manual.txt')
})
it('authenticates the owner before accessing a locked collection, without provider calls or filenames before unlock',async()=>{
 const f=await fixture();await f.add();await f.store.index(f.id);await f.store.protect(f.id,'dedicated',{pin:'123456',biometric:true});await f.store.lock(f.id);f.embed.mockClear()
 expect((await f.store.list())[0]).toMatchObject({locked:true,name:'Protected collection'});await expect(f.store.data(f.id)).rejects.toThrow('Unlock');await expect(f.store.search(f.id,'payment')).rejects.toThrow('Unlock');expect(f.embed).not.toHaveBeenCalled()
 await f.store.authorize(f.id);expect(f.unlock).toHaveBeenCalledWith('knowledge:'+f.id);expect((await f.store.search(f.id,'payment')).matches).toHaveLength(1)
})
it('allows biometric-only collections and preserves a PIN when adding biometrics',async()=>{
 const f=await fixture();await f.store.protect(f.id,'dedicated',{pin:'123456',biometric:false});await f.store.protect(f.id,'dedicated',{biometric:true});expect(await f.keys.status('knowledge:'+f.id)).toMatchObject({pin:true,biometric:true});await f.store.lock(f.id);await f.keys.unlock('knowledge:'+f.id,'biometric');expect((await f.store.data(f.id)).name).toBe('Company secrets')
 const second=await fixture();await second.store.protect(second.id,'dedicated',{biometric:true});await second.store.lock(second.id);await second.keys.unlock('knowledge:'+second.id,'biometric');expect((await second.store.data(second.id)).files).toEqual([])
})
it('denies cancelled HITL access and never calls embeddings',async()=>{
 const f=await fixture();await f.store.protect(f.id,'dedicated',{pin:'123456'});await f.store.lock(f.id);f.unlock.mockResolvedValueOnce(false);await expect(f.store.authorize(f.id)).rejects.toThrow('declined');expect(f.embed).not.toHaveBeenCalled()
})
it('reuses hashes, rejects old configuration and removes derived passages when deleting a document',async()=>{
 const f=await fixture(),file=await f.add();await f.store.index(f.id);f.embed.mockClear();await f.store.index(f.id);expect(f.embed).not.toHaveBeenCalled();await f.store.configure(f.id,'Company secrets',{...f.cfg,model:'other'});await expect(f.store.search(f.id,'payment')).rejects.toThrow('Build');await f.store.index(f.id);await f.store.removeFile(f.id,file);expect(await f.store.indexStatus(f.id)).toBeNull();expect((await f.store.data(f.id)).files).toEqual([])
})
it('rechecks authentication after an in-flight embedding request',async()=>{
 const f=await fixture();await f.add();await f.store.index(f.id);await f.store.protect(f.id,'dedicated',{pin:'123456'});f.embed.mockImplementationOnce(async inputs=>{f.keys.lock('knowledge:'+f.id);return inputs.map(()=>[1,0])});await expect(f.store.search(f.id,'payment')).rejects.toThrow('Unlock')
})
it('restores app-unlock access and removes the encrypted collection without deleting another one',async()=>{
 const f=await fixture();await f.keys.configure('app',{pin:'123456',biometric:false});await f.store.protect(f.id,'app');f.keys.lock('app');await expect(f.store.data(f.id)).rejects.toThrow('Unlock');await f.keys.unlock('app','pin','123456');const other=await f.store.create('Other',f.cfg);await f.store.remove(f.id);expect((await f.store.list()).map(row=>row.id)).toEqual([other])
})

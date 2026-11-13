import 'fake-indexeddb/auto'
import {expect,it,vi} from 'vitest'
import {VaultDatabase} from '@/packages/vault/database'
import {VaultKeys} from '@/packages/vault/keys'
import {EncryptedChunkStore} from '@/packages/vault/chunk-store'
import type {VaultRuntime} from '@/packages/vault/runtime'
import {RagSettingsSchema} from '@shared/session-rag'
import {KnowledgeCollections,type CollectionAdapters} from './store'
import {exportVault,importVault} from '@/packages/vault/backup'

async function fixture(adapters:Partial<CollectionAdapters>={}){
 const blobs=new Map<string,string>(),envelopes=new Map<string,string>(),db=new VaultDatabase('kb-'+crypto.randomUUID()),device={capabilities:async()=>({encryption:true,biometric:true,name:'Test device'}),protect:async(value:string)=>{const id=crypto.randomUUID();envelopes.set(id,value);return id},unprotect:async(id:string)=>{const value=envelopes.get(id);if(!value)throw Error('Missing device key');return value}},keys=new VaultKeys(db,device)
 const assets=new EncryptedChunkStore({get:async key=>blobs.get(key)||null,set:async(key,value)=>{blobs.set(key,value)},remove:async key=>{blobs.delete(key)},keys:async()=>[...blobs.keys()]},db,scope=>keys.key(scope))
 const vault={db,keys,assets,projects:{assertApp:async()=>{}},available:async()=>{await keys.key('public');return true}} as unknown as VaultRuntime
 const embed=vi.fn(async(inputs:{text?:string}[])=>inputs.map(input=>input.text?.includes('cat')?[0,1]:[1,0])),unlock=vi.fn(async(scope:string)=>{await keys.unlock(scope,'pin','123456');return true}),store=new KnowledgeCollections(vault,{extract:async(_source,bytes)=>({text:new TextDecoder().decode(bytes)}),embed,validate:()=>{},unlock,...adapters})
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
it('fails closed when a protection change is interrupted partway through key rewrapping',async()=>{
 const f=await fixture();await f.add();const original=f.store.vault.assets.rewrap.bind(f.store.vault.assets);let count=0;const spy=vi.spyOn(f.store.vault.assets,'rewrap').mockImplementation(async(ref,scope)=>{if(++count===2)throw Error('Interrupted storage write');return original(ref,scope)})
 await expect(f.store.protect(f.id,'dedicated',{pin:'123456'})).rejects.toThrow('Interrupted');f.keys.lock('knowledge:'+f.id);expect((await f.store.list())[0].locked).toBe(true);await expect(f.store.data(f.id)).rejects.toThrow('Unlock');spy.mockRestore();await f.store.authorize(f.id);await f.store.protect(f.id,'dedicated');expect((await f.store.list())[0]).toMatchObject({scope:'knowledge:'+f.id,pendingScopes:undefined})
})
it('restores encrypted library backups as new collections, without vector caches or implicit provider consent',async()=>{
 const f=await fixture();await f.add();await f.store.index(f.id);const chunks:Uint8Array<ArrayBuffer>[]=[];for await(const chunk of exportVault(f.store.vault.assets,'a safe backup passphrase',new Set(['public'])))chunks.push(Uint8Array.from(chunk));const backup=new Blob(chunks);expect(await backup.text()).not.toContain('Confidential')
 const target=await fixture(),before=(await target.store.list()).map(row=>row.id);await importVault(target.store.vault.assets,target.store.vault.assets.blobs,backup,'a safe backup passphrase','public',new AbortController().signal,async refs=>{await target.store.restoreImported(refs,new AbortController().signal)})
 const restored=(await target.store.list()).find(row=>!before.includes(row.id))!;expect(restored).toBeTruthy();expect(await target.store.indexStatus(restored.id)).toBeNull();expect((await target.store.data(restored.id)).files).toHaveLength(1);await expect(target.store.search(restored.id,'payment')).rejects.toThrow('consent');expect(target.embed).not.toHaveBeenCalled();await target.store.configure(restored.id,'Restored',target.cfg);await target.store.index(restored.id);expect((await target.store.search(restored.id,'payment')).matches).toHaveLength(1)
})
it('removes staged vector shards after cancellation while retaining the last committed index',async()=>{
 const f=await fixture();await f.add();await f.store.index(f.id);await f.add('long.txt','payment '.repeat(10000));const before=(await f.db.aliases()).filter(alias=>alias.includes('/data/')).sort();let batches=0
 f.embed.mockImplementation(async inputs=>{if(++batches===2)f.store.cancel(f.id);return inputs.map(()=>[1,0])});await expect(f.store.index(f.id)).rejects.toThrow();expect((await f.db.aliases()).filter(alias=>alias.includes('/data/')).sort()).toEqual(before);expect((await f.store.indexStatus(f.id))?.files).toHaveLength(1)
})
it('keeps a published index valid if cancellation arrives after its manifest is committed',async()=>{
 const f=await fixture();await f.add();const original=f.store.vault.assets.put.bind(f.store.vault.assets);vi.spyOn(f.store.vault.assets,'put').mockImplementation(async(source,info,scope,alias,signal)=>{const ref=await original(source,info,scope,alias,signal);if(alias?.endsWith('/index.json'))f.store.cancel(f.id);return ref})
 await f.store.index(f.id);expect((await f.store.search(f.id,'payment')).matches).toHaveLength(1)
})

it('uses the optional LLM reranker only after collection opt-in, preserving protected access and source identities',async()=>{
 const llmRerank=vi.fn(async()=>[{index:1,score:0.9},{index:0,score:0.1}]),rerank=vi.fn(),f=await fixture({llmRerank,rerank})
 await f.add('project.md','Project contract and billing');await f.add('cat.md','cat news');await f.store.index(f.id)
 await f.store.search(f.id,'project');expect(llmRerank).not.toHaveBeenCalled()
 await f.store.configure(f.id,'Company secrets',f.cfg,'test','small','llm')
 const ranked=await f.store.search(f.id,'project'),rows=await f.store.chunks(f.id,new Set(ranked.matches.map(hit=>hit.id)))
 expect(rows.find(row=>row.chunk.id===ranked.matches[0].id)?.filename).toBe('cat.md');expect(llmRerank).toHaveBeenCalledOnce();expect(rerank).not.toHaveBeenCalled()
 await f.store.protect(f.id,'dedicated',{pin:'123456'});await f.store.lock(f.id);llmRerank.mockClear()
 await expect(f.store.search(f.id,'project')).rejects.toThrow();expect(llmRerank).not.toHaveBeenCalled()
})

it('keeps native multimodal retrieval instead of asking a text-only LLM to rank MIME placeholders',async()=>{
 const llmRerank=vi.fn(),f=await fixture({llmRerank,extract:async()=>({media:true})})
 await f.store.configure(f.id,'Photos',{...f.cfg,images:true},'test','small','llm');const bytes=new Uint8Array([1,2,3]);await f.store.add(f.id,{name:'photo.png',type:'image/png',size:3,arrayBuffer:async()=>bytes.buffer} as File);await f.store.index(f.id)
 const found=await f.store.search(f.id,'photo');expect(found.matches).toHaveLength(1);expect(found).toHaveProperty('rerankWarning');expect(llmRerank).not.toHaveBeenCalled()
})

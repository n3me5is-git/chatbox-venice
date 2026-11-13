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
 await f.store.configure(f.id,'Photos',{...f.cfg,provider:'gemini',images:true},'test','small','llm');const bytes=new Uint8Array([1,2,3]);await f.store.add(f.id,{name:'photo.png',type:'image/png',size:3,arrayBuffer:async()=>bytes.buffer} as File);await f.store.index(f.id)
 const found=await f.store.search(f.id,'photo');expect(found.matches).toHaveLength(1);expect(found).toHaveProperty('rerankWarning');expect(llmRerank).not.toHaveBeenCalled()
})

const extractRelations=vi.fn(async(text:string)=>{const match=/Project (\w+) has client (\w+)\./.exec(text);if(!match)throw Error('Synthetic source missing');const [,project,client]=match;return {summary:text,entities:[{name:project,type:'project',quote:match[0]},{name:client,type:'client',quote:match[0]}],relations:[{subject:project,predicate:'HAS_CLIENT',object:client,quote:match[0]}],tags:[{key:'client',value:client,quote:match[0]}]}})
const advanced=()=>({augmentation:{enabled:true,model:{provider:'private',model:'small'},keepMarkdown:true,mediaText:false,windowChars:8000},retrievalMode:'hybrid' as const})
it('publishes encrypted vectors, derivatives and source-grounded metadata together and reuses unchanged work',async()=>{
 extractRelations.mockClear();const f=await fixture({analyze:extractRelations});await f.add('alpha.md','Project Alpha has client Acme.');await f.add('beta.md','Project Beta has client Nova.');await f.store.configure(f.id,'Projects',f.cfg,undefined,undefined,undefined,advanced());await f.store.index(f.id)
 expect(extractRelations).toHaveBeenCalledTimes(2);expect((await f.store.metadata(f.id,{type:'client'})).results.flatMap(row=>row.entities.map(entity=>entity.name))).toEqual(['Acme','Nova']);expect(JSON.stringify([...f.blobs])).not.toContain('Acme')
 const file=(await f.store.data(f.id)).files[0];expect((await f.store.documentText(f.id,file.id)).text).toContain('Acme');await f.store.index(f.id);expect(extractRelations).toHaveBeenCalledTimes(2);expect(f.embed).toHaveBeenCalledTimes(2)
 const next=new TextEncoder().encode('Project Alpha has client Oscar.');await f.store.replaceFile(f.id,file.id,{name:file.name,type:file.mime,size:next.length,arrayBuffer:async()=>next.buffer} as File);expect((await f.store.metadata(f.id,{type:'client'})).results.flatMap(row=>row.entities.map(entity=>entity.name))).not.toContain('Acme');await f.store.index(f.id);expect(extractRelations).toHaveBeenCalledTimes(3);expect(f.embed).toHaveBeenCalledTimes(3)
 expect((await f.store.metadata(f.id,{type:'client'})).results.flatMap(row=>row.entities.map(entity=>entity.name))).toEqual(['Oscar','Nova'])
})
it('keeps the last complete generation after invalid extraction and removes only the failed staging assets',async()=>{
 const analyze=vi.fn(extractRelations),f=await fixture({analyze});await f.add('alpha.md','Project Alpha has client Acme.');await f.store.configure(f.id,'Projects',f.cfg,undefined,undefined,undefined,advanced());await f.store.index(f.id);const before=await f.store.indexStatus(f.id)
 analyze.mockRejectedValueOnce(Error('Extraction unavailable'));await expect(f.store.index(f.id,()=>{},true)).rejects.toThrow('unavailable');expect(await f.store.indexStatus(f.id)).toEqual(before);expect((await f.store.search(f.id,'Acme')).matches).toHaveLength(1)
})
it('retains OCR alongside native image vectors only after the separate media-text opt-in and never OCRs during preview',async()=>{
 const extract=vi.fn(async(_source:any,_bytes:any,cfg:any)=>cfg.images?{media:true}:{text:'Project Alpha has client Acme.',kind:'ocr' as const}),f=await fixture({extract,analyze:extractRelations}),cfg={...f.cfg,provider:'gemini',images:true,ocr:true,ocrProvider:'vision',ocrModel:'vision'},bytes=new Uint8Array([1,2,3]);await f.store.add(f.id,{name:'source.png',type:'image/png',size:3,arrayBuffer:async()=>bytes.buffer} as File)
 await f.store.configure(f.id,'Photos',cfg,undefined,undefined,undefined,{...advanced(),augmentation:{...advanced().augmentation,mediaText:true}});await f.store.index(f.id);expect(extract).toHaveBeenCalledTimes(1);const file=(await f.store.data(f.id)).files[0],parsed=await f.store.documentText(f.id,file.id);expect(parsed).toMatchObject({kind:'ocr',text:'Project Alpha has client Acme.'});expect(extract).toHaveBeenCalledTimes(1)
 await f.store.index(f.id);expect(extract).toHaveBeenCalledTimes(1)
})
it('deletes only one document from vector and graph generations without re-embedding other sources',async()=>{
 const f=await fixture({analyze:extractRelations});await f.add('alpha.md','Project Alpha has client Acme.');await f.add('beta.md','Project Beta has client Nova.');await f.store.configure(f.id,'Projects',f.cfg,undefined,undefined,undefined,advanced());await f.store.index(f.id);const [first]=(await f.store.data(f.id)).files;f.embed.mockClear();await f.store.removeFile(f.id,first.id)
 expect((await f.store.indexStatus(f.id))?.files).toHaveLength(1);expect((await f.store.metadata(f.id,{type:'client'})).results.flatMap(row=>row.entities.map(entity=>entity.name))).toEqual(['Nova']);expect(f.embed).not.toHaveBeenCalled()
})

it('stores stable encrypted citation receipts with context, detects changed sources and removes receipts with their file',async()=>{
 const f=await fixture(),fileId=await f.add('manual.txt','Confidential payment instructions.'),other=await f.add('other.txt','Another document.');await f.store.index(f.id)
 const chunks=await f.store.chunks(f.id,[{fileId,chunkIndex:0}]),refs=await f.store.citeChunks(f.id,chunks),again=await f.store.citeChunks(f.id,chunks)
 expect(refs).toEqual(again);const evidence=await f.store.readEvidence(f.id,fileId,refs[0].id);expect(evidence).toMatchObject({quote:'Confidential payment instructions.',stale:false,name:'manual.txt'})
 expect(JSON.stringify([...f.blobs])).not.toContain('Confidential');expect((await f.db.aliases()).filter(alias=>alias.includes('/evidence/'))).toHaveLength(1)
 await expect(f.store.readEvidence(f.id,other,refs[0].id)).rejects.toThrow();await f.store.protect(f.id,'dedicated',{pin:'123456'});await f.store.lock(f.id);await expect(f.store.readEvidence(f.id,fileId,refs[0].id)).rejects.toThrow('Unlock');await f.store.authorize(f.id)
 const bytes=new TextEncoder().encode('Changed document.');await f.store.replaceFile(f.id,fileId,{name:'manual.txt',type:'text/plain',size:bytes.length,arrayBuffer:async()=>bytes.buffer} as File)
 expect(await f.store.readEvidence(f.id,fileId,refs[0].id)).toMatchObject({quote:'Confidential payment instructions.',stale:true});await expect(f.store.citeChunks(f.id,chunks)).rejects.toThrow('changed')
 await f.store.removeFile(f.id,fileId);expect((await f.db.aliases()).filter(alias=>alias.includes('/evidence/'))).toHaveLength(0);await expect(f.store.readEvidence(f.id,fileId,refs[0].id)).rejects.toThrow('not found')
})
it('creates metadata source references only for matching source and text revisions, without provider calls on preview',async()=>{
 const f=await fixture(),fileId=await f.add('source.txt','Project Aurora has client Acme.'),document=await f.store.documentText(f.id,fileId),input={fileId,sourceHash:document.sourceHash,textHash:document.textHash,start:0,end:31}
 const refs=await f.store.citeAnchors(f.id,[input]);expect(refs[0].quote).toBe('Project Aurora has client Acme.');expect(f.embed).not.toHaveBeenCalled();await expect(f.store.citeAnchors(f.id,[{...input,textHash:'a'.repeat(64)}])).rejects.toThrow('changed');await expect(f.store.citeAnchors(f.id,[{...input,end:9000}])).rejects.toThrow('range')
})

it('does not pay embeddings or metadata extraction after removal or metadata-only source replacement',async()=>{
 const analyze=vi.fn(async()=>({summary:'Project',entities:[{name:'Acme',type:'client',quote:'Apollo has client Acme.'},{name:'Apollo',type:'project',quote:'Apollo has client Acme.'}],relations:[{subject:'Apollo',predicate:'HAS_CLIENT',object:'Acme',quote:'Apollo has client Acme.'}],tags:[]})),extract=vi.fn(async()=>({text:'Apollo has client Acme.'})),f=await fixture({analyze,extract}),fileId=await f.add('one.txt','raw-v1'),other=await f.add('two.txt','other-source')
 await f.store.configure(f.id,'Projects',f.cfg,undefined,undefined,'api',{augmentation:{enabled:true,model:{provider:'private',model:'extract'},keepMarkdown:true,mediaText:false,windowChars:8000},retrievalMode:'hybrid'});await f.store.index(f.id);f.embed.mockClear();analyze.mockClear()
 const bytes=new TextEncoder().encode('raw-v2');await f.store.replaceFile(f.id,fileId,{name:'one.txt',type:'text/plain',size:bytes.length,arrayBuffer:async()=>bytes.buffer} as File);const index=await f.store.index(f.id);expect(f.embed).not.toHaveBeenCalled();expect(analyze).not.toHaveBeenCalled();expect((await f.store.metadata(f.id,{})).indexingStats).toMatchObject({reboundDocuments:1})
 await f.store.removeFile(f.id,other);expect(f.embed).not.toHaveBeenCalled();expect(analyze).not.toHaveBeenCalled();expect((await f.store.metadata(f.id,{})).results).toHaveLength(1)
})

it('forces Venice media settings to text while preserving independently opted-in OCR/STT',async()=>{
 const f=await fixture();await f.store.configure(f.id,'Text embeddings',{...f.cfg,images:true,audio:true,ocr:true,ocrProvider:'vision',ocrModel:'private-ocr',stt:true,sttProvider:'venice',sttModel:'whisper'})
 expect((await f.store.data(f.id)).settings).toMatchObject({images:false,audio:false,ocr:true,stt:true,ocrModel:'private-ocr',sttModel:'whisper'})
})

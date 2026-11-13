import {KnowledgeEvidenceSchema,knowledgeEvidenceId,knowledgeEvidenceUrl,type KnowledgeEvidence} from '@shared/knowledge-evidence'
import {KnowledgeAccessGate} from './access-gate'
import {AugmentedCollectionIndex,KnowledgeStateSchema,type KnowledgeState} from './augmented'
import {KnowledgeAugmentationSchema,type KnowledgeAugmentation} from '@shared/knowledge-augmentation'
import {hybridRagSearch} from '@shared/knowledge-hybrid'
import {ragHash} from '@shared/session-rag-engine'
import { RagSettingsSchema, RAG_ROOT, RagChunkSchema, RagIndexSchema, type RagSettings, type RagChunk } from '@shared/session-rag'
import { SessionRagEngine, type RagEnginePort } from '@shared/session-rag-engine'
import type { VaultRuntime } from '@/packages/vault/runtime'
import { VaultJsonRecords } from '@/packages/vault/json-records'
import {resourceMime} from '@shared/session-resources'

export type CollectionEntry={id:number;scope:string;createdAt:number;pendingScopes?:string[]}
export type CollectionFile={id:number;path:string;name:string;mime:string;bytes:number;alias:string;createdAt:number;hash?:string;assetId?:string}
export type CollectionData={version:1;name:string;settings:RagSettings;files:CollectionFile[];consented?:boolean;rerankProvider?:string;rerankModel?:string;rerankMode?:'api'|'llm';augmentation?:KnowledgeAugmentation;retrievalMode?:'semantic'|'hybrid'}
export type CollectionSummary=CollectionEntry&{name:string;locked:boolean;settings?:RagSettings}
export interface CollectionAdapters {extract:RagEnginePort['extract'];embed:RagEnginePort['embed'];validate(settings:RagSettings):void;unlock(scope:string):Promise<boolean>;authority?(settings:RagSettings):string;embeddingIdentity?(settings:RagSettings):Promise<string>;rerank?(query:string,documents:string[],provider:string,model:string,signal:AbortSignal):Promise<{index:number;score:number}[]>;llmRerank?:CollectionAdapters['rerank'];analyze?:(text:string,settings:KnowledgeAugmentation,signal:AbortSignal)=>Promise<unknown>;analysisAuthority?:(settings:KnowledgeAugmentation)=>string}
const REGISTRY='knowledge-collections:v1',prefix=(id:number)=>'knowledge-collection:'+id+':'
export const isPortableCollection=(id:number)=>Number.isSafeInteger(id)&&id<0
const identity=()=>Math.floor(Date.now()*1000+Math.random()*1000)

/** Collection metadata, original files and derived vectors are separate encrypted assets.
 * The public registry contains opaque identities and access policies only. */
export class KnowledgeCollections {
  private json:VaultJsonRecords
  private jobs=new Map<number,AbortController>()
  private gates=new Map<number,KnowledgeAccessGate>()
  private evidenceWrites=new Map<string,Promise<KnowledgeEvidence>>()
  private gate(id:number){let gate=this.gates.get(id);if(!gate){gate=new KnowledgeAccessGate();this.gates.set(id,gate)}return gate}
  private async read<T>(id:number,work:()=>Promise<T>):Promise<T>{if(typeof navigator!=='undefined'&&navigator.locks)return await navigator.locks.request('chatbox-kb-read:'+id,{mode:'shared'},work);return await this.gate(id).read(work)}
  private async publish<T>(id:number,work:()=>Promise<T>):Promise<T>{if(typeof navigator!=='undefined'&&navigator.locks)return await navigator.locks.request('chatbox-kb-read:'+id,work);return await this.gate(id).publish(work)}
  private tail:Promise<unknown>=Promise.resolve()
  constructor(readonly vault:VaultRuntime,private adapters:CollectionAdapters){this.json=new VaultJsonRecords(vault.assets,10*1024*1024)}
  private serial<T>(work:()=>Promise<T>):Promise<T>{const run=async():Promise<T>=>{if(typeof navigator!=='undefined'&&navigator.locks)return await navigator.locks.request('chatbox-knowledge-collections',work);return await work()};const next=this.tail.then(run,run);this.tail=next.catch(()=>{});return next}
  private registry(){return this.vault.db.getSetting<CollectionEntry[]>(REGISTRY).then(value=>value||[])}
  private async entry(id:number){if(!isPortableCollection(id))throw Error('Invalid knowledge collection');const entry=(await this.registry()).find(item=>item.id===id);if(!entry)throw Error('Knowledge collection not found');return entry}
  async assert(id:number){await this.vault.projects.assertApp();const entry=await this.entry(id);for(const scope of [entry.scope,...entry.pendingScopes||[]])await this.vault.keys.key(scope);return entry}
  async authorize(id:number){await this.vault.projects.assertApp();const entry=await this.entry(id);for(const scope of [entry.scope,...entry.pendingScopes||[]])if(scope!=='public'&&!this.vault.keys.isUnlocked(scope)){if(!await this.adapters.unlock(scope))throw Error('Knowledge collection access was declined')}await this.assert(id)}
  async list(retry=0):Promise<CollectionSummary[]>{await this.vault.projects.assertApp();const revision=this.vault.keys.snapshot(),result:CollectionSummary[]=[];for(const item of await this.registry()){
    const locked=[item.scope,...item.pendingScopes||[]].some(scope=>!this.vault.keys.isUnlocked(scope))
    if(locked){result.push({...item,name:'Protected collection',locked:true});continue}
    const data=await this.data(item.id);result.push({...item,name:data.name,settings:data.settings,locked:false})
  }await this.vault.projects.assertApp();if(this.vault.keys.snapshot()!==revision){if(retry===0)return this.list(1);throw Error('Collection access changed; repeat discovery')}return result}
  async data(id:number){await this.assert(id);const data=await this.json.get<CollectionData>(prefix(id)+'manifest');if(!data||data.version!==1||!Array.isArray(data.files))throw Error('Invalid knowledge collection');data.settings=RagSettingsSchema.parse(data.settings);if(data.augmentation)data.augmentation=KnowledgeAugmentationSchema.parse(data.augmentation);return data}
  private async save(id:number,data:CollectionData){const entry=await this.assert(id);await this.json.set(prefix(id)+'manifest',data,entry.scope);await this.assert(id)}
  async create(name:string,settings:RagSettings){return this.serial(async()=>{
    await this.vault.projects.assertApp();if(!await this.vault.available())throw Error('Device encryption is unavailable');if(!name.trim()||name.length>200)throw Error('Enter a collection name')
    const cfg=RagSettingsSchema.parse({...settings,enabled:true,...(settings.provider==='venice'?{images:false,audio:false}:{})});this.adapters.validate(cfg)
    const entries=await this.registry();let id=-identity();while(entries.some(entry=>entry.id===id))id--
    await this.json.set(prefix(id)+'manifest',{version:1,name:name.trim(),settings:cfg,files:[],consented:true} satisfies CollectionData,'public')
    try{await this.vault.db.setSetting(REGISTRY,[...entries,{id,scope:'public',createdAt:Date.now()}])}catch(error){await this.json.remove(prefix(id)+'manifest');throw error}return id
  })}
  async configure(id:number,name:string,settings:RagSettings,rerankProvider?:string,rerankModel?:string,rerankMode?:'api'|'llm',knowledge?:{augmentation?:KnowledgeAugmentation;retrievalMode?:'semantic'|'hybrid'}){return this.serial(async()=>{
    if(this.jobs.has(id))throw Error('Stop indexing before changing this collection');const data=await this.data(id);if(!name.trim()||name.length>200)throw Error('Enter a collection name')
    if(rerankMode==='llm'&&(!rerankProvider||!rerankModel))throw Error('Choose a reranking LLM');if(rerankMode&&rerankMode!=='llm'&&rerankMode!=='api')throw Error('Invalid reranking mode');const cfg=RagSettingsSchema.parse({...settings,enabled:true,...(settings.provider==='venice'?{images:false,audio:false}:{})}),augmentation=knowledge?.augmentation?KnowledgeAugmentationSchema.parse(knowledge.augmentation):data.augmentation;if(augmentation?.enabled&&!augmentation.model)throw Error('Choose a knowledge extraction model first');if(augmentation?.enabled&&augmentation.mediaText&&(cfg.images&&!cfg.ocr||cfg.audio&&!cfg.stt))throw Error('Enable OCR or STT before extracting metadata from native media');this.adapters.validate(cfg);await this.save(id,{...data,name:name.trim(),settings:cfg,rerankProvider,rerankModel,rerankMode,augmentation,retrievalMode:knowledge?.retrievalMode||data.retrievalMode,consented:true})
  })}
  async add(id:number,file:File){return (await this.addMany(id,[file]))[0]}
  async addMany(id:number,files:readonly File[]){return this.serial(async()=>{
    if(this.jobs.has(id))throw Error('Stop indexing before changing this collection');const data=await this.data(id);if(data.files.length+files.length>2000)throw Error('Session file count limit reached');if(files.some(file=>file.size<1||file.size>10*1024*1024))throw Error('Session files must not exceed 10 MB')
    const entry=await this.assert(id),added:CollectionFile[]=[],created:string[]=[],identities=new Set(data.files.map(file=>file.id))
    try{for(const file of files){await this.assert(id);const safeName=file.name.replace(/[\\/\u0000-\u001f]/g,'_'),extension=/\.[a-z0-9]{1,16}$/i.exec(safeName)?.[0]||'';let fileId=identity();while(identities.has(fileId))fileId++;identities.add(fileId);const path='documents/'+fileId+'/'+(safeName.length>180?safeName.slice(0,160)+extension:safeName),alias=prefix(id)+'source:'+fileId,mime=file.type||resourceMime(file.name),bytes=new Uint8Array(await file.arrayBuffer())
      try{const hash=await ragHash(bytes),ref=await this.vault.assets.put((async function*(){yield bytes})(),{name:file.name,mime,kind:'document',hidden:true,sourceId:alias},entry.scope,alias);created.push(ref);const header=await this.vault.assets.header(ref);if(!header)throw Error('Knowledge document is unavailable');added.push({id:fileId,path,name:file.name,mime,bytes:file.size,alias,createdAt:Date.now(),hash,assetId:header.id})}finally{bytes.fill(0)}
    }await this.save(id,{...data,files:[...data.files,...added]});return added.map(file=>file.id)
    }catch(error){try{const current=await this.data(id),retained=new Set(current.files.map(file=>file.assetId));for(const ref of created){const header=await this.vault.assets.header(ref);if(header&&!retained.has(header.id))await this.vault.assets.remove(ref).catch(()=>{})}}catch{/* preserve encrypted staged sources when publication state is unreadable */}throw error}
  })}
  private dataReader(id:number){let snapshot:{assetId:string;data:CollectionData}|undefined;return async()=>{
    await this.assert(id);const before=await this.vault.assets.header(prefix(id)+'manifest');if(!before)throw Error('Knowledge collection not found');if(snapshot?.assetId===before.id){await this.assert(id);return snapshot.data}
    const data=await this.data(id),after=await this.vault.assets.header(prefix(id)+'manifest');await this.assert(id);if(before.id!==after?.id)throw Error('Knowledge collection changed; retry explicitly');snapshot={assetId:before.id,data};return data
  }}
  private async fileRevision(id:number,file:CollectionFile){await this.assert(id);const header=await this.vault.assets.header(file.alias);await this.assert(id);if(!header)return null
    // Hash and immutable asset identity were bound inside the encrypted source
    // manifest when bytes were ingested. This is stronger than an mtime check.
    if(file.hash&&/^[a-f0-9]{64}$/.test(file.hash)&&file.assetId===header.id&&header.bytes===file.bytes)return file.hash
    const bytes=await this.sourceFile(id,file);try{const hash=await ragHash(bytes);await this.assert(id);return hash}finally{bytes.fill(0)}
  }
  async sourceRevision(id:number,path:string){return this.read(id,async()=>{const file=(await this.data(id)).files.find(file=>file.path===path);return file?this.fileRevision(id,file):null})}
  private async bindSources(id:number,data:CollectionData){let changed=false;const files:CollectionFile[]=[];for(const file of data.files){const before=await this.vault.assets.header(file.alias);if(!before)throw Error('Knowledge document is unavailable');if(file.hash&&file.assetId===before.id){files.push(file);continue}const bytes=await this.sourceFile(id,file);try{const hash=await ragHash(bytes),after=await this.vault.assets.header(file.alias);if(after?.id!==before.id)throw Error('Knowledge source changed during indexing');files.push({...file,hash,assetId:before.id});changed=true}finally{bytes.fill(0)}}const updated={...data,files};if(changed)await this.save(id,updated);return updated}
  async source(id:number,path:string){const file=(await this.data(id)).files.find(item=>item.path===path);if(!file)throw Error('Knowledge document not found');return this.sourceFile(id,file)}
  private async sourceFile(id:number,file:CollectionFile){await this.assert(id);const header=await this.vault.assets.header(file.alias);if(!header||header.bytes>10*1024*1024)throw Error('Knowledge document is unavailable');const bytes=new Uint8Array(header.bytes);let offset=0;try{for await(const chunk of this.vault.assets.read(file.alias)){bytes.set(chunk,offset);offset+=chunk.length;chunk.fill(0)}if(offset!==header.bytes)throw Error('Incomplete knowledge source');await this.assert(id);return bytes}catch(error){bytes.fill(0);throw error}}
  async replaceFile(id:number,fileId:number,file:File){return this.serial(async()=>{
    if(this.jobs.has(id))throw Error('Stop indexing before changing this collection');if(!file.size||file.size>10*1024*1024)throw Error('Session files must not exceed 10 MB');const data=await this.data(id),source=data.files.find(item=>item.id===fileId);if(!source)throw Error('Knowledge document not found');if(file.type&&file.type!==source.mime)throw Error('Replacement must use the same file type');const bytes=new Uint8Array(await file.arrayBuffer()),hash=await ragHash(bytes)
    try{return await this.publish(id,async()=>{const entry=await this.assert(id),old=await this.vault.assets.header(source.alias);let ref:string|undefined
      try{ref=await this.vault.assets.put((async function*(){yield bytes})(),{name:source.name,mime:source.mime,kind:'document',hidden:true,sourceId:source.alias},entry.scope,source.alias);await this.save(id,{...data,files:data.files.map(item=>item.id===fileId?{...item,bytes:file.size,hash,assetId:ref!.slice('vault-asset-'.length)}:item)});if(old)await this.vault.assets.remove('vault-asset-'+old.id).catch(()=>{});return fileId}
      catch(error){try{const current=await this.json.get<CollectionData>(prefix(id)+'manifest');if(current?.files.find(item=>item.id===fileId)?.assetId!==ref?.slice('vault-asset-'.length)){if(old)await this.vault.assets.index.put(old);if(ref)await this.vault.assets.remove(ref).catch(()=>{})}}catch{/* preserve both generations while access is unavailable */}throw error}
    })}finally{bytes.fill(0)}
  })}
  async removeFile(id:number,fileId:number){return this.serial(async()=>{
    if(this.jobs.has(id))throw Error('Stop indexing before changing this collection');const data=await this.data(id),file=data.files.find(item=>item.id===fileId);if(!file)return
    await this.publish(id,async()=>{await this.save(id,{...data,files:data.files.filter(item=>item.id!==fileId)});const entry=await this.assert(id),raw=await this.json.get(prefix(id)+'.chatbox/knowledge/state.json'),state=raw?KnowledgeStateSchema.parse(raw):null,native=await this.nativeIndex(id),garbage=new Set<string>()
      if(native){for(const item of native.files)if(item.path===file.path)for(const alias of item.shards)garbage.add(alias);await this.json.set(prefix(id)+RAG_ROOT+'index.json',{...native,updated:Date.now(),files:native.files.filter(item=>item.path!==file.path),errors:native.errors.filter(item=>item.path!==file.path)},entry.scope)}
      if(state){for(const item of state.vector.files)if(item.path===file.path)for(const alias of item.shards)garbage.add(alias);for(const ref of state.metadata?.files||[])if(ref.fileId===String(fileId))garbage.add(ref.alias);for(const ref of state.derivatives)if(ref.fileId===String(fileId))garbage.add(ref.alias);const next={...state,revision:crypto.randomUUID(),vector:{...state.vector,updated:Date.now(),files:state.vector.files.filter(item=>item.path!==file.path),errors:state.vector.errors.filter(item=>item.path!==file.path)},metadata:state.metadata?{...state.metadata,files:state.metadata.files.filter(item=>item.fileId!==String(fileId))}:null,derivatives:state.derivatives.filter(item=>item.fileId!==String(fileId))};await this.json.set(prefix(id)+'.chatbox/knowledge/state.json',next,entry.scope)}
      for(const alias of await this.assetAliases(id))if(alias.startsWith(prefix(id)+'.chatbox/knowledge/evidence/'+fileId+'/'))await this.json.remove(alias);await this.vault.assets.remove(file.alias);for(const alias of garbage)await this.json.remove(prefix(id)+alias).catch(()=>{});if(data.files.length===1)await this.clearDerived(id)
    })
  })}
  private async assetAliases(id:number){const aliases:string[]=[];for await(const header of this.vault.db.all())if(header.alias?.startsWith(prefix(id)))aliases.push(header.alias);return aliases}
  private async clearDerived(id:number){await this.assert(id);for(const alias of await this.assetAliases(id))if(alias.startsWith(prefix(id)+RAG_ROOT)||alias.startsWith(prefix(id)+'.chatbox/knowledge/'))await this.vault.assets.remove(alias)}
  async clearIndex(id:number){return this.serial(async()=>{if(this.jobs.has(id))throw Error('Stop indexing before clearing the index');await this.publish(id,()=>this.clearDerived(id))})}
  async remove(id:number){return this.serial(()=>this.publish(id,async()=>{if(this.jobs.has(id))throw Error('Stop indexing before deleting this collection');await this.assert(id);for(const alias of await this.assetAliases(id))await this.vault.assets.remove(alias);await this.vault.db.setSetting(REGISTRY,(await this.registry()).filter(item=>item.id!==id))}))}
  async protect(id:number,mode:'none'|'app'|'dedicated',options:{pin?:string;biometric?:boolean}={}){return this.serial(()=>this.publish(id,async()=>{
    if(this.jobs.has(id))throw Error('Stop indexing before changing this collection');const entry=await this.assert(id);let scope='public'
    if(mode==='app'){scope='app';await this.vault.keys.key(scope)}
    if(mode==='dedicated'){scope='knowledge:'+id;const status=await this.vault.keys.status(scope);if(options.pin||options.biometric!==undefined)await this.vault.keys.configure(scope,{pin:options.pin,biometric:!!options.biometric,keepPin:status.pin&&!options.pin});else if(status.configured)await this.vault.keys.key(scope);else throw Error('Choose at least one unlock method')}
    // Publish a fail-closed policy before rewrapping. An interrupted change requires BOTH keys.
    const replace=async(value:CollectionEntry)=>this.vault.db.setSetting(REGISTRY,(await this.registry()).map(item=>item.id===id?value:item))
    await replace({...entry,pendingScopes:[...new Set([entry.scope,scope,...entry.pendingScopes||[]])]})
    for(const alias of await this.assetAliases(id))await this.vault.assets.rewrap(alias,scope)
    await replace({...entry,scope,pendingScopes:undefined});this.vault.keys.refresh()
  }))}
  async lock(id:number){const entry=await this.entry(id);if(entry.scope!=='public')this.vault.keys.lock(entry.scope);this.jobs.get(id)?.abort()}
  running(id:number){return this.jobs.has(id)}
  hasActiveJobs(){return this.jobs.size>0}
  cancel(id:number){this.jobs.get(id)?.abort()}
  private async ragPort(id:number,settings:RagSettings,signal:AbortSignal,load=this.dataReader(id)){const expected=JSON.stringify(settings),authority=this.adapters.authority?.(settings);const check=async()=>{signal.throwIfAborted();await this.assert(id);if(JSON.stringify((await load()).settings)!==expected||this.adapters.authority?.(settings)!==authority)throw Error('RAG settings changed; start the operation again')};const port:RagEnginePort={
    embeddingSpace:await this.adapters.embeddingIdentity?.(settings),check,list:async()=>(await load()).files.map(file=>({path:file.path,mime:file.mime,bytes:file.bytes})),read:async path=>{await check();const file=(await load()).files.find(file=>file.path===path);if(!file)throw Error('Knowledge document not found');return this.sourceFile(id,file)},revision:async path=>{await check();const file=(await load()).files.find(file=>file.path===path);return file?this.fileRevision(id,file):null},
    get:async path=>{await check();return this.json.get(prefix(id)+path)},put:async(path,value)=>{await check();const entry=await this.assert(id);const save=()=>this.json.set(prefix(id)+path,value,entry.scope);if(path===RAG_ROOT+'index.json')await this.publish(id,save);else await save()},
    // Only cache shards owned by this authorized job reach this callback. Cleanup must
    // survive cancellation/locking; it neither decrypts nor deletes source documents.
    remove:async path=>{if(!/^\.chatbox\/rag\/data\/[a-f0-9-]+\.json$/.test(path))throw Error('Invalid RAG index');await this.json.remove(prefix(id)+path)},
    extract:this.adapters.extract,embed:async(inputs,query,cfg,sig)=>{await check();const result=await this.adapters.embed(inputs,query,cfg,sig);await check();return result},
  };return port}
  private async engine(id:number,settings:RagSettings,signal:AbortSignal){return new SessionRagEngine(await this.ragPort(id,settings,signal))}
  private async pipeline(id:number,data:CollectionData,signal:AbortSignal){
    const load=this.dataReader(id),base=await this.ragPort(id,data.settings,signal,load),cfg=KnowledgeAugmentationSchema.parse(data.augmentation||{}),expected=JSON.stringify([data.augmentation,data.retrievalMode]),authority=this.adapters.analysisAuthority?.(cfg)
    const check=async()=>{await base.check();const current=await load();if(JSON.stringify([current.augmentation,current.retrievalMode])!==expected||this.adapters.analysisAuthority?.(cfg)!==authority)throw Error('Knowledge settings changed; retry explicitly')}
    return new AugmentedCollectionIndex({get:async<T>(path:string)=>{await check();return this.json.get<T>(prefix(id)+path)},put:async(path,value)=>{await check();const entry=await this.assert(id);await this.json.set(prefix(id)+path,value,entry.scope)},remove:async path=>{if(!/^\.chatbox\/(?:rag\/data|knowledge\/(?:data|text))\/[a-f0-9-]{36}\.json$/.test(path))throw Error('Invalid knowledge asset');await this.json.remove(prefix(id)+path)},check,publish:work=>this.publish(id,work)},base,data.files,async(text,settings,sig)=>{if(!this.adapters.analyze)throw Error('The knowledge extraction model is unavailable');await check();const value=await this.adapters.analyze(text,settings,sig);await check();return value})
  }
  async index(id:number,progress:(path:string)=>void=()=>{},rebuild=false){
    if(this.jobs.has(id))throw Error('RAG indexing is already running');await this.assert(id);const data=await this.data(id);if(!data.consented)throw Error('Save provider consent on this device before using this collection');const {settings}=data;this.adapters.validate(settings);const controller=new AbortController();this.jobs.set(id,controller)
    const cancel=()=>controller.abort(),unsubscribe=this.vault.keys.subscribe(cancel),hidden=()=>{if(document.hidden)cancel()};if(typeof document!=='undefined')document.addEventListener('visibilitychange',hidden)
    try{return await this.serial(async()=>{const bound=await this.bindSources(id,await this.data(id)),pipeline=await this.pipeline(id,bound,controller.signal);if(data.augmentation?.enabled||data.augmentation?.keepMarkdown||settings.ocr||settings.stt||await pipeline.state())return pipeline.index(settings,KnowledgeAugmentationSchema.parse(data.augmentation||{}),controller.signal,progress,rebuild);return(await this.engine(id,settings,controller.signal)).index(settings,controller.signal,progress,rebuild)})}
    finally{unsubscribe();this.jobs.delete(id);if(typeof document!=='undefined')document.removeEventListener('visibilitychange',hidden)}
  }
  async search(id:number,query:string,signal=new AbortController().signal){return this.read(id,async()=>{
    await this.assert(id);const data=await this.data(id);if(!data.consented)throw Error('Save provider consent on this device before using this collection');const pipeline=await this.pipeline(id,data,signal),snapshot=await pipeline.state(),port=pipeline.vectorPort(snapshot),found=data.retrievalMode==='hybrid'||data.augmentation?.enabled?await hybridRagSearch(port,query,data.settings,signal,20):await new SessionRagEngine(port).search(query,data.settings,signal,20)
    const rerank=data.rerankMode==='llm'?this.adapters.llmRerank:this.adapters.rerank;if(data.rerankProvider&&data.rerankModel&&!rerank)throw Error('The selected reranker is unavailable')
    if(data.rerankProvider&&data.rerankModel&&rerank&&found.matches.length){const index=snapshot?.vector||await this.nativeIndex(id),chunks=await this.readChunks(id,data,index,this.matchRequests(data,found.matches)),documents=found.matches.map(hit=>chunks.find(row=>row.chunk.id===hit.id)?.text||hit.modality||'');if(data.rerankMode==='llm'&&found.matches.some(hit=>!chunks.find(row=>row.chunk.id===hit.id)?.text.trim()))return {...found,rerankWarning:'Native media has no extracted text; the original embedding ranking was preserved'};await this.assert(id);const ranked=await rerank(query,documents,data.rerankProvider,data.rerankModel,signal);await this.assert(id);found.matches=ranked.map(item=>({...found.matches[item.index],score:item.score}))}return found
  })}
  private async nativeIndex(id:number){await this.assert(id);const raw=await this.json.get(prefix(id)+RAG_ROOT+'index.json');return raw?RagIndexSchema.parse(raw):null}
  async indexStatus(id:number){await this.assert(id);const raw=await this.json.get(prefix(id)+'.chatbox/knowledge/state.json');if(!raw)return this.nativeIndex(id);const state=KnowledgeStateSchema.parse(raw),data=await this.data(id);return {...state.vector,files:state.vector.files.map(file=>{const source=data.files.find(source=>source.path===file.path),metadata=state.metadata?.files.find(item=>item.fileId===String(source?.id));return metadata?.warningCount?{...file,warning:'Some extracted relations were excluded because their evidence was insufficient'}:file})}}
  private async readChunks(id:number,data:CollectionData,index:Awaited<ReturnType<KnowledgeCollections['indexStatus']>>,requested:{fileId:number;chunkIndex:number}[]|Set<string>,maximum=20){
    await this.assert(id);if(requested instanceof Set?requested.size>maximum:requested.length>maximum)throw Error('Request at most 20 passages');if(!index)return [];const result:{fileId:number;filename:string;chunkIndex:number;text:string;chunk:RagChunk}[]=[]
    for(const file of data.files){if(!(requested instanceof Set)&&!requested.some(item=>item.fileId===file.id))continue;const indexed=index.files.find(item=>item.path===file.path);let at=0
      for(const [shardIndex,path] of (indexed?.shards||[]).entries()){at=shardIndex*32;if(!(requested instanceof Set)&&!requested.some(item=>item.fileId===file.id&&item.chunkIndex>=at&&item.chunkIndex<at+32))continue;await this.assert(id);const raw=await this.json.get<unknown[]>(prefix(id)+path);if(!Array.isArray(raw)||raw.length>32)throw Error('Invalid RAG index');for(const value of raw){const chunk=RagChunkSchema.parse(value),chunkIndex=at++;if(chunk.path!==file.path||chunk.sourceHash!==indexed?.hash)throw Error('Invalid RAG index');if(requested instanceof Set?requested.has(chunk.id):requested.some(item=>item.fileId===file.id&&item.chunkIndex===chunkIndex))result.push({fileId:file.id,filename:file.name,chunkIndex,text:chunk.text,chunk})}}
    }await this.assert(id);return result
  }
  private matchRequests(data:CollectionData,matches:readonly {id:string;path:string;chunkIndex?:number}[]){if(matches.some(hit=>hit.chunkIndex===undefined))return new Set(matches.map(hit=>hit.id));const files=new Map(data.files.map(file=>[file.path,file.id]));return matches.map(hit=>{const fileId=files.get(hit.path);if(fileId===undefined||!Number.isSafeInteger(hit.chunkIndex)||hit.chunkIndex!<0)throw Error('Knowledge index changed; repeat the search');return {fileId,chunkIndex:hit.chunkIndex!}})}
  async chunksForMatches(id:number,matches:readonly {id:string;path:string;chunkIndex?:number}[]){return this.read(id,async()=>{const data=await this.data(id),rows=await this.readChunks(id,data,await this.indexStatus(id),this.matchRequests(data,matches));if(matches.some(hit=>!rows.some(row=>row.chunk.id===hit.id)))throw Error('Knowledge index changed; repeat the search');return rows})}
  async chunks(id:number,requested:{fileId:number;chunkIndex:number}[]|Set<string>){return this.read(id,async()=>this.readChunks(id,await this.data(id),await this.indexStatus(id),requested))}
  async metadata(id:number,input:Parameters<AugmentedCollectionIndex['metadata']>[2],signal=new AbortController().signal){return this.read(id,async()=>{const data=await this.data(id);if(!data.consented)throw Error('Save provider consent on this device before using this collection');const pipeline=await this.pipeline(id,data,signal),snapshot=await pipeline.state();if(!snapshot)throw Error('Build the advanced knowledge index first');return pipeline.metadata(snapshot,KnowledgeAugmentationSchema.parse(data.augmentation||{}),input,signal)})}
  async documentText(id:number,fileId:number,signal=new AbortController().signal){return this.read(id,async()=>{
    const data=await this.data(id),file=data.files.find(file=>file.id===fileId);if(!file)throw Error('Knowledge document not found');const pipeline=await this.pipeline(id,data,signal),snapshot=await pipeline.state(),saved=snapshot?await pipeline.text(snapshot,fileId):null
    if(saved){if(await this.fileRevision(id,file)!==saved.sourceHash)throw Error('Knowledge source changed; reindex this collection');signal.throwIfAborted();await this.assert(id);return {...saved,name:file.name,mime:file.mime}}
    const bytes=await this.sourceFile(id,file)
    try{const sourceHash=await ragHash(bytes)
      // A viewer never starts remote OCR/STT or an implicit paid model request.
      const result=await this.adapters.extract(file,bytes,{...data.settings,images:false,audio:false,ocr:false,stt:false},signal);signal.throwIfAborted();await this.assert(id);if(result.text===undefined)throw Error('Reindex this collection to retain its OCR or transcript');const text=result.text.replace(/\r\n?/g,'\n');return {version:1 as const,text,sourceHash,textHash:await ragHash(new TextEncoder().encode(text)),kind:'parsed' as const,name:file.name,mime:file.mime}
    }finally{bytes.fill(0)}
  })}
  async toolCapabilities(id:number){const entry=await this.entry(id);await this.vault.projects.assertApp();if([entry.scope,...entry.pendingScopes||[]].some(scope=>!this.vault.keys.isUnlocked(scope)))return {advanced:false,locked:true};const data=await this.data(id);return {advanced:!!data.augmentation?.enabled,locked:false}}
  private async evidence(id:number,input:Omit<KnowledgeEvidence,'id'|'version'|'created'>){
    const identity=await knowledgeEvidenceId(input),key=prefix(id)+'.chatbox/knowledge/evidence/'+input.fileId+'/'+identity+'.json';let work=this.evidenceWrites.get(key)
    if(!work){work=(async()=>{await this.assert(id);const existing=await this.json.get(key);if(existing){const record=KnowledgeEvidenceSchema.parse(existing);if(record.id!==identity||record.collectionId!==id||record.fileId!==input.fileId||await knowledgeEvidenceId(record)!==identity)throw Error('Invalid knowledge reference');return record}const entry=await this.assert(id),record=KnowledgeEvidenceSchema.parse({...input,id:identity,version:1,created:Date.now()});await this.json.set(key,record,entry.scope);await this.assert(id);return record})();this.evidenceWrites.set(key,work);void work.finally(()=>this.evidenceWrites.delete(key)).catch(()=>{})}const record=await work;await this.assert(id);return {id:record.id,url:knowledgeEvidenceUrl(id,record.fileId,record.id)}
  }
  async citeChunks(id:number,requested:{fileId:number;chunkIndex:number;text:string}[]){return this.read(id,async()=>{
    if(requested.length>20)throw Error('Request at most 20 passages');const data=await this.data(id),index=await this.indexStatus(id),neighbors=requested.flatMap(item=>[item.chunkIndex-1,item.chunkIndex,item.chunkIndex+1].filter(n=>n>=0).map(chunkIndex=>({fileId:item.fileId,chunkIndex}))),rows=await this.readChunks(id,data,index,neighbors,64),hashes=new Map<number,string>(),references=[]
    for(const item of requested){const row=rows.find(row=>row.fileId===item.fileId&&row.chunkIndex===item.chunkIndex),file=data.files.find(file=>file.id===item.fileId);if(!row||!file||row.text!==item.text)throw Error('Knowledge index changed; repeat the search');if(!row.text.trim())continue
      if(!hashes.has(file.id))hashes.set(file.id,await this.fileRevision(id,file)||'');
      if(hashes.get(file.id)!==row.chunk.sourceHash)throw Error('Knowledge source changed; reindex this collection')
      const reference=await this.evidence(id,{collectionId:id,fileId:file.id,name:file.name,mime:file.mime,sourceHash:row.chunk.sourceHash,quote:row.text,before:rows.find(part=>part.fileId===file.id&&part.chunkIndex===item.chunkIndex-1)?.text||'',after:rows.find(part=>part.fileId===file.id&&part.chunkIndex===item.chunkIndex+1)?.text||'',line:row.chunk.line,endLine:row.chunk.endLine,page:row.chunk.page});references.push({fileId:file.id,chunkIndex:item.chunkIndex,...reference})
    }await this.assert(id);return references
  })}
  async citeAnchors(id:number,requested:{fileId:number;sourceHash:string;textHash:string;start:number;end:number}[],signal=new AbortController().signal){
    if(requested.length>8)throw Error('Request at most 8 source excerpts');const groups=new Map<number,typeof requested>();for(const item of requested){if(!Number.isSafeInteger(item.start)||!Number.isSafeInteger(item.end)||item.start<0||item.end<=item.start||item.end-item.start>8000)throw Error('Invalid source excerpt range');const group=groups.get(item.fileId)||[];group.push(item);groups.set(item.fileId,group)}const references:{id:string;url:string;fileId:number;quote:string;sourceHash:string;textHash:string;start:number;end:number}[]=[]
    for(const [fileId,items] of groups){const document=await this.documentText(id,fileId,signal);await this.read(id,async()=>{const data=await this.data(id),file=data.files.find(file=>file.id===fileId);if(!file)throw Error('Knowledge document not found');const bytes=await this.source(id,file.path);try{if(await ragHash(bytes)!==document.sourceHash)throw Error('Knowledge source changed; reindex this collection')}finally{bytes.fill(0)}
      for(const item of items){signal.throwIfAborted();if(item.sourceHash!==document.sourceHash||item.textHash!==document.textHash||item.end>document.text.length)throw Error('Knowledge source changed; reindex this collection');const quote=document.text.slice(item.start,item.end),line=document.text.slice(0,item.start).split('\n').length,reference=await this.evidence(id,{collectionId:id,fileId,name:file.name,mime:file.mime,sourceHash:document.sourceHash,textHash:document.textHash,start:item.start,end:item.end,quote,before:document.text.slice(Math.max(0,item.start-2000),item.start),after:document.text.slice(item.end,item.end+2000),line,endLine:line+quote.split('\n').length-1});references.push({...reference,fileId,quote,sourceHash:document.sourceHash,textHash:document.textHash,start:item.start,end:item.end})}await this.assert(id)
    })}return references
  }
  async readEvidence(id:number,fileId:number,identity:string){return this.read(id,async()=>{
    if(!/^[a-f0-9]{64}$/.test(identity)||!Number.isSafeInteger(fileId)||fileId<1)throw Error('Invalid knowledge reference');const data=await this.data(id),file=data.files.find(file=>file.id===fileId);if(!file)throw Error('Knowledge document not found');const raw=await this.json.get(prefix(id)+'.chatbox/knowledge/evidence/'+fileId+'/'+identity+'.json'),record=KnowledgeEvidenceSchema.parse(raw);if(record.id!==identity||record.collectionId!==id||record.fileId!==fileId||await knowledgeEvidenceId(record)!==identity)throw Error('This knowledge reference is no longer available');const stale=await this.fileRevision(id,file)!==record.sourceHash;await this.assert(id);return {...record,stale}
  })}
  /** Recreate collections from an authenticated library backup, with fresh identities.
   * Only source files are restored. Derived vectors are rebuilt after device-local consent. */
  async restoreImported(refs:readonly string[],signal:AbortSignal){return this.serial(async()=>{
    await this.vault.projects.assertApp();const grouped=new Map<string,Map<string,{ref:string;scope:string;bytes:number}>>(),created:string[]=[]
    for(const ref of refs){signal.throwIfAborted();const header=await this.vault.assets.header(ref);if(!header)continue;const info=await this.vault.assets.info(header),alias=info.sourceId,match=alias&&/^knowledge-collection:(-\d+):/.exec(alias);if(!match)continue;const entries=grouped.get(match[1])||new Map();if(entries.has(alias))throw Error('Invalid knowledge collection backup');entries.set(alias,{ref,scope:header.scope,bytes:header.bytes});grouped.set(match[1],entries)}
    const registry=await this.registry(),incoming:CollectionEntry[]=[]
    try{for(const [oldId,entries] of grouped){signal.throwIfAborted();const oldPrefix='knowledge-collection:'+oldId+':',manifest=entries.get(oldPrefix+'manifest');if(!manifest)throw Error('Invalid knowledge collection backup');const raw=await this.json.get<CollectionData>(manifest.ref)
        if(!raw||raw.version!==1||typeof raw.name!=='string'||raw.name.length>200||!Array.isArray(raw.files)||raw.files.length>2000)throw Error('Invalid knowledge collection backup')
        const settings=RagSettingsSchema.parse(raw.settings),augmentation=raw.augmentation?KnowledgeAugmentationSchema.parse(raw.augmentation):undefined;let id=-identity();while([...registry,...incoming].some(entry=>entry.id===id))id--
        const files:CollectionFile[]=[],seen=new Set<string>(),paths=new Set<string>()
        for(const file of raw.files){signal.throwIfAborted();if(!Number.isSafeInteger(file.id)||file.id<=0||typeof file.name!=='string'||file.name.length>512||typeof file.mime!=='string'||file.mime.length>200||!Number.isSafeInteger(file.bytes)||file.bytes<1||typeof file.path!=='string'||file.path.length>240||!file.path.startsWith('documents/')||file.path.split('/').some(part=>part==='..'||part==='.')||/[\\\u0000-\u001f]/.test(file.path)||file.alias!==oldPrefix+'source:'+file.id||seen.has(file.alias)||paths.has(file.path))throw Error('Invalid knowledge collection backup');seen.add(file.alias);paths.add(file.path)
          const source=entries.get(file.alias);if(!source||source.scope!==manifest.scope||source.bytes!==file.bytes||source.bytes>10*1024*1024)throw Error('Invalid knowledge collection backup');const alias=prefix(id)+'source:'+file.id,header=await this.vault.assets.header(source.ref);if(!header)throw Error('Invalid knowledge collection backup');const info=await this.vault.assets.info(header)
          created.push(await this.vault.assets.put(this.vault.assets.read(source.ref),{...info,hidden:true,sourceId:alias},manifest.scope,alias,signal));files.push({...file,alias})
        }
        const alias=prefix(id)+'manifest';await this.json.set(alias,{version:1,name:raw.name,settings,files,augmentation,retrievalMode:raw.retrievalMode,rerankProvider:raw.rerankProvider,rerankModel:raw.rerankModel,rerankMode:raw.rerankMode,consented:false},manifest.scope);created.push(alias);incoming.push({id,scope:manifest.scope,createdAt:Date.now()})
      }
      signal.throwIfAborted();await this.vault.projects.assertApp();for(const entry of incoming)await this.vault.keys.key(entry.scope)
      await this.vault.db.setSetting(REGISTRY,[...registry,...incoming]);for(const entries of grouped.values())for(const item of entries.values())await this.vault.assets.remove(item.ref).catch(()=>{});return incoming.length
    }catch(error){for(const ref of created)await this.vault.assets.remove(ref).catch(()=>{});throw error}
  })}
}

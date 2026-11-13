import { RagSettingsSchema, RAG_ROOT, RagChunkSchema, RagIndexSchema, type RagSettings, type RagChunk } from '@shared/session-rag'
import { SessionRagEngine, type RagEnginePort } from '@shared/session-rag-engine'
import type { VaultRuntime } from '@/packages/vault/runtime'
import { VaultJsonRecords } from '@/packages/vault/json-records'
import {resourceMime} from '@shared/session-resources'

export type CollectionEntry={id:number;scope:string;createdAt:number;pendingScopes?:string[]}
export type CollectionFile={id:number;path:string;name:string;mime:string;bytes:number;alias:string;createdAt:number}
export type CollectionData={version:1;name:string;settings:RagSettings;files:CollectionFile[];consented?:boolean;rerankProvider?:string;rerankModel?:string;rerankMode?:'api'|'llm'}
export type CollectionSummary=CollectionEntry&{name:string;locked:boolean;settings?:RagSettings}
export interface CollectionAdapters {extract:RagEnginePort['extract'];embed:RagEnginePort['embed'];validate(settings:RagSettings):void;unlock(scope:string):Promise<boolean>;authority?(settings:RagSettings):string;rerank?(query:string,documents:string[],provider:string,model:string,signal:AbortSignal):Promise<{index:number;score:number}[]>;llmRerank?:CollectionAdapters['rerank']}
const REGISTRY='knowledge-collections:v1',prefix=(id:number)=>'knowledge-collection:'+id+':'
export const isPortableCollection=(id:number)=>Number.isSafeInteger(id)&&id<0
const identity=()=>Math.floor(Date.now()*1000+Math.random()*1000)

/** Collection metadata, original files and derived vectors are separate encrypted assets.
 * The public registry contains opaque identities and access policies only. */
export class KnowledgeCollections {
  private json:VaultJsonRecords
  private jobs=new Map<number,AbortController>()
  private tail:Promise<unknown>=Promise.resolve()
  constructor(readonly vault:VaultRuntime,private adapters:CollectionAdapters){this.json=new VaultJsonRecords(vault.assets,10*1024*1024)}
  private serial<T>(work:()=>Promise<T>):Promise<T>{const run=async():Promise<T>=>{if(typeof navigator!=='undefined'&&navigator.locks)return await navigator.locks.request('chatbox-knowledge-collections',work);return await work()};const next=this.tail.then(run,run);this.tail=next.catch(()=>{});return next}
  private registry(){return this.vault.db.getSetting<CollectionEntry[]>(REGISTRY).then(value=>value||[])}
  private async entry(id:number){if(!isPortableCollection(id))throw Error('Invalid knowledge collection');const entry=(await this.registry()).find(item=>item.id===id);if(!entry)throw Error('Knowledge collection not found');return entry}
  async assert(id:number){await this.vault.projects.assertApp();const entry=await this.entry(id);for(const scope of [entry.scope,...entry.pendingScopes||[]])await this.vault.keys.key(scope);return entry}
  async authorize(id:number){await this.vault.projects.assertApp();const entry=await this.entry(id);for(const scope of [entry.scope,...entry.pendingScopes||[]])if(scope!=='public'&&!this.vault.keys.isUnlocked(scope)){if(!await this.adapters.unlock(scope))throw Error('Knowledge collection access was declined')}await this.assert(id)}
  async list():Promise<CollectionSummary[]>{await this.vault.projects.assertApp();const result:CollectionSummary[]=[];for(const item of await this.registry()){
    const locked=[item.scope,...item.pendingScopes||[]].some(scope=>!this.vault.keys.isUnlocked(scope))
    if(locked){result.push({...item,name:'Protected collection',locked:true});continue}
    const data=await this.data(item.id);result.push({...item,name:data.name,settings:data.settings,locked:false})
  }return result}
  async data(id:number){await this.assert(id);const data=await this.json.get<CollectionData>(prefix(id)+'manifest');if(!data||data.version!==1||!Array.isArray(data.files))throw Error('Invalid knowledge collection');data.settings=RagSettingsSchema.parse(data.settings);return data}
  private async save(id:number,data:CollectionData){const entry=await this.assert(id);await this.json.set(prefix(id)+'manifest',data,entry.scope);await this.assert(id)}
  async create(name:string,settings:RagSettings){return this.serial(async()=>{
    await this.vault.projects.assertApp();if(!await this.vault.available())throw Error('Device encryption is unavailable');if(!name.trim()||name.length>200)throw Error('Enter a collection name')
    const cfg=RagSettingsSchema.parse({...settings,enabled:true});this.adapters.validate(cfg)
    const entries=await this.registry();let id=-identity();while(entries.some(entry=>entry.id===id))id--
    await this.json.set(prefix(id)+'manifest',{version:1,name:name.trim(),settings:cfg,files:[],consented:true} satisfies CollectionData,'public')
    try{await this.vault.db.setSetting(REGISTRY,[...entries,{id,scope:'public',createdAt:Date.now()}])}catch(error){await this.json.remove(prefix(id)+'manifest');throw error}return id
  })}
  async configure(id:number,name:string,settings:RagSettings,rerankProvider?:string,rerankModel?:string,rerankMode?:'api'|'llm'){return this.serial(async()=>{
    if(this.jobs.has(id))throw Error('Stop indexing before changing this collection');const data=await this.data(id);if(!name.trim()||name.length>200)throw Error('Enter a collection name')
    if(rerankMode==='llm'&&(!rerankProvider||!rerankModel))throw Error('Choose a reranking LLM');if(rerankMode&&rerankMode!=='llm'&&rerankMode!=='api')throw Error('Invalid reranking mode');const cfg=RagSettingsSchema.parse({...settings,enabled:true});this.adapters.validate(cfg);await this.save(id,{...data,name:name.trim(),settings:cfg,rerankProvider,rerankModel,rerankMode,consented:true})
  })}
  async add(id:number,file:File){return this.serial(async()=>{
    if(this.jobs.has(id))throw Error('Stop indexing before changing this collection');if(file.size<1||file.size>10*1024*1024)throw Error('Session files must not exceed 10 MB')
    const data=await this.data(id);if(data.files.length>=2000)throw Error('Session file count limit reached');const safeName=file.name.replace(/[\\/\u0000-\u001f]/g,'_'),extension=/\.[a-z0-9]{1,16}$/i.exec(safeName)?.[0]||'',entry=await this.assert(id),fileId=identity(),path='documents/'+fileId+'/'+(safeName.length>180?safeName.slice(0,160)+extension:safeName),alias=prefix(id)+'source:'+fileId,mime=file.type||resourceMime(file.name)
    const bytes=new Uint8Array(await file.arrayBuffer());let ref:string|undefined
    try{ref=await this.vault.assets.put((async function*(){yield bytes})(),{name:file.name,mime,kind:'document',hidden:true,sourceId:alias},entry.scope,alias)
      await this.save(id,{...data,files:[...data.files,{id:fileId,path,name:file.name,mime,bytes:file.size,alias,createdAt:Date.now()}]})
    }catch(error){if(ref)await this.vault.assets.remove(ref).catch(()=>{});throw error}finally{bytes.fill(0)}return fileId
  })}
  async source(id:number,path:string){await this.assert(id);const data=await this.data(id),file=data.files.find(item=>item.path===path);if(!file)throw Error('Knowledge document not found');const header=await this.vault.assets.header(file.alias);if(!header||header.bytes>10*1024*1024)throw Error('Knowledge document is unavailable');const bytes=new Uint8Array(header.bytes);let offset=0;try{for await(const chunk of this.vault.assets.read(file.alias)){bytes.set(chunk,offset);offset+=chunk.length;chunk.fill(0)}await this.assert(id);return bytes}catch(error){bytes.fill(0);throw error}}
  async removeFile(id:number,fileId:number){return this.serial(async()=>{if(this.jobs.has(id))throw Error('Stop indexing before changing this collection');const data=await this.data(id),file=data.files.find(item=>item.id===fileId);if(!file)return;await this.save(id,{...data,files:data.files.filter(item=>item.id!==fileId)});await this.vault.assets.remove(file.alias);await this.clearDerived(id)})}
  private async assetAliases(id:number){const aliases:string[]=[];for await(const header of this.vault.db.all())if(header.alias?.startsWith(prefix(id)))aliases.push(header.alias);return aliases}
  private async clearDerived(id:number){await this.assert(id);for(const alias of await this.assetAliases(id))if(alias.startsWith(prefix(id)+RAG_ROOT))await this.vault.assets.remove(alias)}
  async clearIndex(id:number){return this.serial(async()=>{if(this.jobs.has(id))throw Error('Stop indexing before clearing the index');await this.clearDerived(id)})}
  async remove(id:number){return this.serial(async()=>{if(this.jobs.has(id))throw Error('Stop indexing before deleting this collection');await this.assert(id);for(const alias of await this.assetAliases(id))await this.vault.assets.remove(alias);await this.vault.db.setSetting(REGISTRY,(await this.registry()).filter(item=>item.id!==id))})}
  async protect(id:number,mode:'none'|'app'|'dedicated',options:{pin?:string;biometric?:boolean}={}){return this.serial(async()=>{
    if(this.jobs.has(id))throw Error('Stop indexing before changing this collection');const entry=await this.assert(id);let scope='public'
    if(mode==='app'){scope='app';await this.vault.keys.key(scope)}
    if(mode==='dedicated'){scope='knowledge:'+id;const status=await this.vault.keys.status(scope);if(options.pin||options.biometric!==undefined)await this.vault.keys.configure(scope,{pin:options.pin,biometric:!!options.biometric,keepPin:status.pin&&!options.pin});else if(status.configured)await this.vault.keys.key(scope);else throw Error('Choose at least one unlock method')}
    // Publish a fail-closed policy before rewrapping. An interrupted change requires BOTH keys.
    const replace=async(value:CollectionEntry)=>this.vault.db.setSetting(REGISTRY,(await this.registry()).map(item=>item.id===id?value:item))
    await replace({...entry,pendingScopes:[...new Set([entry.scope,scope,...entry.pendingScopes||[]])]})
    for(const alias of await this.assetAliases(id))await this.vault.assets.rewrap(alias,scope)
    await replace({...entry,scope,pendingScopes:undefined});this.vault.keys.refresh()
  })}
  async lock(id:number){const entry=await this.entry(id);if(entry.scope!=='public')this.vault.keys.lock(entry.scope);this.jobs.get(id)?.abort()}
  running(id:number){return this.jobs.has(id)}
  hasActiveJobs(){return this.jobs.size>0}
  cancel(id:number){this.jobs.get(id)?.abort()}
  private async engine(id:number,settings:RagSettings,signal:AbortSignal){const expected=JSON.stringify(settings),authority=this.adapters.authority?.(settings);const check=async()=>{signal.throwIfAborted();await this.assert(id);if(JSON.stringify((await this.data(id)).settings)!==expected||this.adapters.authority?.(settings)!==authority)throw Error('RAG settings changed; start the operation again')};const port:RagEnginePort={
    check,list:async()=>(await this.data(id)).files.map(file=>({path:file.path,mime:file.mime,bytes:file.bytes})),read:path=>this.source(id,path),
    get:async path=>{await check();return this.json.get(prefix(id)+path)},put:async(path,value)=>{await check();const entry=await this.assert(id);await this.json.set(prefix(id)+path,value,entry.scope)},
    // Only cache shards owned by this authorized job reach this callback. Cleanup must
    // survive cancellation/locking; it neither decrypts nor deletes source documents.
    remove:async path=>{if(!/^\.chatbox\/rag\/data\/[a-f0-9-]+\.json$/.test(path))throw Error('Invalid RAG index');await this.json.remove(prefix(id)+path)},
    extract:this.adapters.extract,embed:async(inputs,query,cfg,sig)=>{await check();const result=await this.adapters.embed(inputs,query,cfg,sig);await check();return result},
  };return new SessionRagEngine(port)}
  async index(id:number,progress:(path:string)=>void=()=>{}){
    if(this.jobs.has(id))throw Error('RAG indexing is already running');await this.assert(id);const data=await this.data(id);if(!data.consented)throw Error('Save provider consent on this device before using this collection');const {settings}=data;this.adapters.validate(settings);const controller=new AbortController();this.jobs.set(id,controller)
    const cancel=()=>controller.abort(),unsubscribe=this.vault.keys.subscribe(cancel),hidden=()=>{if(document.hidden)cancel()};if(typeof document!=='undefined')document.addEventListener('visibilitychange',hidden)
    try{return await this.serial(async()=>await(await this.engine(id,settings,controller.signal)).index(settings,controller.signal,progress))}
    finally{unsubscribe();this.jobs.delete(id);if(typeof document!=='undefined')document.removeEventListener('visibilitychange',hidden)}
  }
  async search(id:number,query:string,signal=new AbortController().signal){await this.assert(id);const data=await this.data(id);if(!data.consented)throw Error('Save provider consent on this device before using this collection');const found=await(await this.engine(id,data.settings,signal)).search(query,data.settings,signal,20)
    const rerank=data.rerankMode==='llm'?this.adapters.llmRerank:this.adapters.rerank;if(data.rerankProvider&&data.rerankModel&&!rerank)throw Error('The selected reranker is unavailable');if(data.rerankProvider&&data.rerankModel&&rerank&&found.matches.length){const chunks=await this.chunks(id,new Set(found.matches.map(hit=>hit.id))),documents=found.matches.map(hit=>chunks.find(row=>row.chunk.id===hit.id)?.text||hit.modality||'');await this.assert(id);const ranked=await rerank(query,documents,data.rerankProvider,data.rerankModel,signal);await this.assert(id);found.matches=ranked.map(item=>({...found.matches[item.index],score:item.score}))}return found}
  async indexStatus(id:number){await this.assert(id);const raw=await this.json.get(prefix(id)+RAG_ROOT+'index.json');return raw?RagIndexSchema.parse(raw):null}
  async chunks(id:number,requested:{fileId:number;chunkIndex:number}[]|Set<string>){await this.assert(id);if(requested instanceof Set?requested.size>20:requested.length>20)throw Error('Request at most 20 passages');const data=await this.data(id),index=await this.indexStatus(id);if(!index)return [];const result:{fileId:number;filename:string;chunkIndex:number;text:string;chunk:RagChunk}[]=[]
    for(const file of data.files){if(!(requested instanceof Set)&&!requested.some(item=>item.fileId===file.id))continue;const indexed=index.files.find(item=>item.path===file.path);let at=0
      for(const path of indexed?.shards||[]){await this.assert(id);const raw=await this.json.get<unknown[]>(prefix(id)+path);for(const value of raw||[]){const chunk=RagChunkSchema.parse(value),chunkIndex=at++;if(requested instanceof Set?requested.has(chunk.id):requested.some(item=>item.fileId===file.id&&item.chunkIndex===chunkIndex))result.push({fileId:file.id,filename:file.name,chunkIndex,text:chunk.text,chunk})}}
    }await this.assert(id);return result
  }
  /** Recreate collections from an authenticated library backup, with fresh identities.
   * Only source files are restored. Derived vectors are rebuilt after device-local consent. */
  async restoreImported(refs:readonly string[],signal:AbortSignal){return this.serial(async()=>{
    await this.vault.projects.assertApp();const grouped=new Map<string,Map<string,{ref:string;scope:string;bytes:number}>>(),created:string[]=[]
    for(const ref of refs){signal.throwIfAborted();const header=await this.vault.assets.header(ref);if(!header)continue;const info=await this.vault.assets.info(header),alias=info.sourceId,match=alias&&/^knowledge-collection:(-\d+):/.exec(alias);if(!match)continue;const entries=grouped.get(match[1])||new Map();if(entries.has(alias))throw Error('Invalid knowledge collection backup');entries.set(alias,{ref,scope:header.scope,bytes:header.bytes});grouped.set(match[1],entries)}
    const registry=await this.registry(),incoming:CollectionEntry[]=[]
    try{for(const [oldId,entries] of grouped){signal.throwIfAborted();const oldPrefix='knowledge-collection:'+oldId+':',manifest=entries.get(oldPrefix+'manifest');if(!manifest)throw Error('Invalid knowledge collection backup');const raw=await this.json.get<CollectionData>(manifest.ref)
        if(!raw||raw.version!==1||typeof raw.name!=='string'||raw.name.length>200||!Array.isArray(raw.files)||raw.files.length>2000)throw Error('Invalid knowledge collection backup')
        const settings=RagSettingsSchema.parse(raw.settings);let id=-identity();while([...registry,...incoming].some(entry=>entry.id===id))id--
        const files:CollectionFile[]=[],seen=new Set<string>(),paths=new Set<string>()
        for(const file of raw.files){signal.throwIfAborted();if(!Number.isSafeInteger(file.id)||file.id<=0||typeof file.name!=='string'||file.name.length>512||typeof file.mime!=='string'||file.mime.length>200||!Number.isSafeInteger(file.bytes)||file.bytes<1||typeof file.path!=='string'||file.path.length>240||!file.path.startsWith('documents/')||file.path.split('/').some(part=>part==='..'||part==='.')||/[\\\u0000-\u001f]/.test(file.path)||file.alias!==oldPrefix+'source:'+file.id||seen.has(file.alias)||paths.has(file.path))throw Error('Invalid knowledge collection backup');seen.add(file.alias);paths.add(file.path)
          const source=entries.get(file.alias);if(!source||source.scope!==manifest.scope||source.bytes!==file.bytes||source.bytes>10*1024*1024)throw Error('Invalid knowledge collection backup');const alias=prefix(id)+'source:'+file.id,header=await this.vault.assets.header(source.ref);if(!header)throw Error('Invalid knowledge collection backup');const info=await this.vault.assets.info(header)
          created.push(await this.vault.assets.put(this.vault.assets.read(source.ref),{...info,hidden:true,sourceId:alias},manifest.scope,alias,signal));files.push({...file,alias})
        }
        const alias=prefix(id)+'manifest';await this.json.set(alias,{version:1,name:raw.name,settings,files,consented:false},manifest.scope);created.push(alias);incoming.push({id,scope:manifest.scope,createdAt:Date.now()})
      }
      signal.throwIfAborted();await this.vault.projects.assertApp();for(const entry of incoming)await this.vault.keys.key(entry.scope)
      await this.vault.db.setSetting(REGISTRY,[...registry,...incoming]);for(const entries of grouped.values())for(const item of entries.values())await this.vault.assets.remove(item.ref).catch(()=>{});return incoming.length
    }catch(error){for(const ref of created)await this.vault.assets.remove(ref).catch(()=>{});throw error}
  })}
}

import {z} from 'zod'
import {RAG_ROOT,RagIndexSchema,type RagSettings} from '@shared/session-rag'
import {SessionRagEngine,ragHash,type RagEnginePort,type RagSource} from '@shared/session-rag-engine'
import {KnowledgeAugmentationSchema,KnowledgeAnalysisManifestSchema,type KnowledgeAugmentation,type KnowledgeAnalysis} from '@shared/knowledge-augmentation'
import {KnowledgeAugmentationEngine,type KnowledgeAnalysisManifest,type KnowledgeDocument} from '@shared/knowledge-augmentation-engine'
const ROOT='.chatbox/knowledge/',CURRENT=ROOT+'state.json',INDEX=RAG_ROOT+'index.json',META=ROOT+'index.json'
const digest=z.string().regex(/^[a-f0-9]{64}$/)
const TextRef=z.object({fileId:z.string().max(128),path:z.string().max(240),sourceHash:digest,textHash:digest,fingerprint:digest,alias:z.string().regex(/^\.chatbox\/knowledge\/text\/[a-f0-9-]{36}\.json$/),kind:z.enum(['parsed','ocr','transcript']),retain:z.boolean()}).strict()
export const KnowledgeStateSchema=z.object({version:z.literal(1),revision:z.string().uuid(),vector:RagIndexSchema,metadata:KnowledgeAnalysisManifestSchema.nullable(),analysisFingerprint:digest,derivatives:z.array(TextRef).max(2000)}).strict()
export type KnowledgeState=z.infer<typeof KnowledgeStateSchema>
const TextSchema=z.object({version:z.literal(1),text:z.string().max(512000),kind:z.enum(['parsed','ocr','transcript']),sourceHash:digest,textHash:digest,fingerprint:digest,warning:z.string().max(500).optional()}).strict()
export interface AugmentedPort{get<T>(path:string):Promise<T|null>;put(path:string,value:unknown):Promise<void>;remove(path:string):Promise<void>;check():Promise<void>;publish(work:()=>Promise<void>):Promise<void>}
export const knowledgeAnalysisFingerprint=async(settings:KnowledgeAugmentation)=>ragHash(new TextEncoder().encode(JSON.stringify(KnowledgeAugmentationSchema.parse(settings))))
const parsingFingerprint=async(settings:RagSettings)=>ragHash(new TextEncoder().encode(JSON.stringify(['parser-v2',settings.ocr,settings.ocrProvider,settings.ocrModel,settings.stt,settings.sttProvider,settings.sttModel])))
/** A single encrypted publication record links vectors, evidence and metadata.
 * Existing immutable shards are reused; old data is removed only after commit. */
export class AugmentedCollectionIndex{
 constructor(private storage:AugmentedPort,private base:RagEnginePort,private files:{id:number;path:string;mime:string}[],private extract:(text:string,settings:KnowledgeAugmentation,signal:AbortSignal)=>Promise<unknown>){}
 async state(){await this.storage.check();const raw=await this.storage.get(CURRENT);return raw?KnowledgeStateSchema.parse(raw):null}
 vectorPort(snapshot:KnowledgeState|null):RagEnginePort{return {...this.base,get:path=>path===INDEX&&snapshot?Promise.resolve(snapshot.vector):this.base.get(path)}}
 async index(settings:RagSettings,configuration:KnowledgeAugmentation,signal:AbortSignal,progress:(path:string)=>void,rebuild=false){
  const cfg=KnowledgeAugmentationSchema.parse(configuration),previous=await this.state(),created=new Set<string>(),garbage=new Set<string>(),texts=new Map<string,z.infer<typeof TextRef>>(),previousText=new Map(previous?.derivatives.map(ref=>[ref.fileId,ref])||[]),parseFingerprint=await parsingFingerprint(settings),analysisFingerprint=await knowledgeAnalysisFingerprint(cfg)
  let vector=previous?.vector||null,metadata:KnowledgeAnalysisManifest|null=rebuild?null:previous?.metadata||null
  const put=async(path:string,value:unknown)=>{await this.storage.check();await this.storage.put(path,value);created.add(path)}
  const parsed=async(source:RagSource,bytes:Uint8Array,options:RagSettings):ReturnType<RagEnginePort['extract']>=>{
   if(source.mime.startsWith('image/')&&options.images||source.mime.startsWith('audio/')&&options.audio)return {media:true}
   const file=this.files.find(file=>file.path===source.path);if(!file)throw Error('Knowledge document not found');const fileId=String(file.id),sourceHash=await ragHash(bytes),old=texts.get(fileId)||previousText.get(fileId)
   if((texts.has(fileId)||!rebuild)&&old?.sourceHash===sourceHash&&old.fingerprint===parseFingerprint){const cached=TextSchema.parse(await this.storage.get(old.alias));if(cached.fingerprint!==old.fingerprint||cached.kind!==old.kind||cached.textHash!==old.textHash||cached.sourceHash!==sourceHash||await ragHash(new TextEncoder().encode(cached.text))!==cached.textHash)throw Error('Invalid knowledge text revision');const ref={...old,retain:cfg.keepMarkdown||old.kind!=='parsed'};texts.set(fileId,ref);return {text:cached.text,warning:cached.warning,kind:cached.kind}}
   const result=await this.base.extract(source,bytes,options,signal);signal.throwIfAborted();await this.storage.check()
   if(result.text!==undefined){if(result.text.length>512000)throw Error('Knowledge text exceeds the analysis limit');const kind=result.kind||'parsed',retain=cfg.keepMarkdown||kind!=='parsed',textHash=await ragHash(new TextEncoder().encode(result.text))
    // Plain UTF-8 sources can be reparsed cheaply. Other parsers get a temporary
    // encrypted derivative, reused in this generation and discarded if not kept.
    if(retain||!source.mime.startsWith('text/')){const alias=ROOT+'text/'+crypto.randomUUID()+'.json';await put(alias,{version:1,text:result.text,sourceHash,textHash,fingerprint:parseFingerprint,kind,warning:result.warning});texts.set(fileId,{fileId,path:source.path,sourceHash,textHash,fingerprint:parseFingerprint,alias,kind,retain})}
   }return result
  }
  const wrapped:RagEnginePort={...this.base,get:async path=>path===INDEX?vector||await this.base.get(path):this.base.get(path),put:async(path,value)=>{if(path===INDEX)vector=RagIndexSchema.parse(value);else await put(path,value)},remove:async path=>{garbage.add(path)},extract:parsed}
  try{
   vector=await new SessionRagEngine(wrapped).index(settings,signal,progress,rebuild);if(vector.errors.length)throw Error('Advanced indexing was not published: '+vector.errors[0].error)
   if(cfg.enabled){if(!cfg.model)throw Error('Choose a knowledge extraction model first')
    const sources=this.files,indexed=vector.files,base=this.base,storage=this.storage
    async function* documents():AsyncGenerator<KnowledgeDocument>{for(const file of indexed){signal.throwIfAborted();await storage.check();const source=sources.find(source=>source.path===file.path);if(!source)continue;const native=source.mime.startsWith('image/')&&settings.images||source.mime.startsWith('audio/')&&settings.audio;if(native&&!cfg.mediaText)continue
     const bytes=await base.read(file.path);try{if(await ragHash(bytes)!==file.hash)throw Error('Knowledge source changed during indexing');const options=native?{...settings,images:false,audio:false}:settings,result=await parsed(source,bytes,options);if(result.media||!result.text?.trim())continue;yield {fileId:String(source.id),sourceHash:file.hash,text:result.text,retainText:false}}finally{bytes.fill(0)}
    }}
    const engine=new KnowledgeAugmentationEngine({get:async<T>(path:string)=>path===META?metadata as T|null:this.storage.get<T>(path),put:async(path,value)=>{if(path===META)metadata=KnowledgeAnalysisManifestSchema.parse(value);else await put(path,value)},remove:async path=>{garbage.add(path)},check:()=>this.storage.check(),extract:this.extract,revision:async fileId=>vector!.files.find(file=>this.files.find(source=>String(source.id)===fileId)?.path===file.path)?.hash||null})
    // Text is stored once as a derivative, never duplicated in graph records.
    metadata=await engine.index(documents(),{...cfg,keepMarkdown:false},signal)
   }else metadata=null
   const retainedTexts=[...texts.values()].filter(ref=>ref.retain&&vector!.files.some(file=>file.path===ref.path&&file.hash===ref.sourceHash))
   // Unchanged vectors may bypass extraction; retain their matching old derivatives.
   for(const ref of previous?.derivatives||[])if(!texts.has(ref.fileId)&&vector.files.some(file=>file.path===ref.path&&file.hash===ref.sourceHash)&&(cfg.keepMarkdown||ref.kind!=='parsed'))retainedTexts.push(ref)
   const state:KnowledgeState={version:1,revision:crypto.randomUUID(),vector,metadata,analysisFingerprint,derivatives:retainedTexts}
   const references=(value:KnowledgeState|null)=>new Set(value?[...value.vector.files.flatMap(file=>file.shards),...value.metadata?.files.map(file=>file.alias)||[],...value.derivatives.map(ref=>ref.alias)]:[]),retained=references(state)
   for(const alias of [...references(previous),...created])if(!retained.has(alias))garbage.add(alias)
   signal.throwIfAborted();await this.storage.check();await this.storage.publish(async()=>{signal.throwIfAborted();await this.storage.check();await this.storage.put(CURRENT,state);for(const alias of garbage)if(!retained.has(alias))await this.storage.remove(alias).catch(()=>{})})
   return state.vector
  }catch(error){
   // Never delete committed files if publication reported an ambiguous I/O error.
   try{const current=await this.state(),retained=new Set(current?[...current.vector.files.flatMap(file=>file.shards),...current.metadata?.files.map(file=>file.alias)||[],...current.derivatives.map(ref=>ref.alias)]:[]);for(const alias of created)if(!retained.has(alias))await this.storage.remove(alias).catch(()=>{})}catch{/* retain owned orphans until storage is available */}
   throw error
  }
 }
 async metadata(snapshot:KnowledgeState,settings:KnowledgeAugmentation,input:Parameters<KnowledgeAugmentationEngine['query']>[0],signal:AbortSignal){
  if(!settings.enabled||snapshot.analysisFingerprint!==await knowledgeAnalysisFingerprint(settings))throw Error('Reindex this collection after changing its advanced settings')
  return new KnowledgeAugmentationEngine({get:async<T>(path:string)=>path===META?snapshot.metadata as T|null:this.storage.get<T>(path),put:async()=>{throw Error('Read only')},remove:async()=>{throw Error('Read only')},check:()=>this.storage.check(),extract:this.extract,revision:async fileId=>{const path=this.files.find(file=>String(file.id)===fileId)?.path;if(!path)return null;const bytes=await this.base.read(path);try{return await ragHash(bytes)}finally{bytes.fill(0)}}}).query(input,signal)
 }
 async text(snapshot:KnowledgeState,fileId:number){const ref=snapshot.derivatives.find(ref=>ref.fileId===String(fileId));if(!ref)return null;await this.storage.check();const result=TextSchema.parse(await this.storage.get(ref.alias));if(result.sourceHash!==ref.sourceHash||result.textHash!==ref.textHash||await ragHash(new TextEncoder().encode(result.text))!==ref.textHash)throw Error('Invalid knowledge text revision');return result}
}

import {canIndexRagScope} from '@shared/session-rag-policy'
import { RAG_ROOT, RagSettingsSchema, RagIndexSchema, type RagSettings, type RagIndex } from '@shared/session-rag'
import { SessionRagEngine, type RagEnginePort } from '@shared/session-rag-engine'
import { sessionFiles, resourcesChanged } from '@/packages/session-resources/files'
import { listSessionResources, readSessionResource } from '@/packages/session-resources/service'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import { settingsStore } from '@/stores/settingsStore'
import platform from '@/platform'
import { extractRagSource } from './extract'
import { multimodalEmbedding, ragProvider, requestRagEmbeddings } from './embeddings'
import { defaultRagSettings } from './defaults'
const vault=()=>vaultRuntimeFor(platform)
const failures=new Map<string,{key:string;error:string}>()
const jobs=new Map<string,{controller:AbortController;path:string}>(),listeners=new Set<()=>void>()
const notify=()=>{for(const listener of listeners)listener()}
export const subscribeRag=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}}
export function subscribeRagPrivacy(id:string,locked:()=>void){let active=true;const check=()=>{void vault().projects.assertSession(id).catch(()=>{if(active)locked()})},unsubscribe=vault().keys.subscribe(check);const hidden=()=>{if(document.hidden)locked()};window.addEventListener('chatbox:privacy-lock',locked);document.addEventListener('visibilitychange',hidden);return()=>{active=false;unsubscribe();window.removeEventListener('chatbox:privacy-lock',locked);document.removeEventListener('visibilitychange',hidden)}}
export const ragJob=(id:string)=>jobs.get(id)
export const hasRagJobs=()=>jobs.size>0
async function get(id:string,path:string){const file=(await sessionFiles.list(id,true)).find(file=>file.path===path);if(!file)return null;const {bytes}=await sessionFiles.read(id,path,true);try{return JSON.parse(new TextDecoder().decode(bytes))}finally{bytes.fill(0)}}
export async function loadRagSettings(id:string):Promise<RagSettings>{
  const saved=await get(id,RAG_ROOT+'settings.json');if(saved)return RagSettingsSchema.parse(saved)
  return defaultRagSettings()
}
const consent=(settings:RagSettings)=>JSON.stringify(settings)
export async function ragAuthorized(id:string,settings:RagSettings){return settings.enabled&&await vault().db.getSetting('rag:consent:'+id)===consent(settings)}
async function put(id:string,path:string,value:unknown){const bytes=new TextEncoder().encode(JSON.stringify(value));try{await sessionFiles.write(id,path,bytes,{mime:'application/json',deliverable:false,managed:true})}finally{bytes.fill(0)}}
export async function configureRag(id:string,input:RagSettings){
  await vault().projects.assertSession(id);const settings=RagSettingsSchema.parse(input)
  if(settings.enabled){ragProvider(settings);if((settings.images||settings.audio)&&!multimodalEmbedding(settings.provider,settings.model))throw Error('This embedding model accepts text only');if(settings.ocr&&(!settings.ocrProvider||!settings.ocrModel))throw Error('Choose an OCR model first')}
  jobs.get(id)?.controller.abort();failures.delete(id);await put(id,RAG_ROOT+'settings.json',settings);await sessionFiles.rag(id,settings.enabled);const {rendererApplication}=await import('@/app/renderer-application');await rendererApplication.sessions.updateSessionHeader(id,header=>{if(!header)throw Error('Chat is unavailable');return {...header,settings:{...header.settings,sessionRagEnabled:settings.enabled}}})
  await vault().db.setSetting('rag:consent:'+id,consent(settings))
  const auto=await vault().db.getSetting<string[]>('rag:auto-sessions')||[];await vault().db.setSetting('rag:auto-sessions',[...auto.filter(value=>value!==id),...(settings.enabled&&settings.auto?[id]:[])])
  startRagMonitoring();notify();return settings
}
export async function assertRagIndexSources(id:string){
  await vault().projects.assertSession(id);const raw=await get(id,RAG_ROOT+'index.json');if(!raw)return
  const index=RagIndexSchema.parse(raw),current=await listSessionResources(id),scope=await vault().projects.sessionScope(id)||undefined
  for(const file of index.files){const source=current.items.find(item=>item.path===file.path);if(!source)throw Error('RAG source changed; rebuild the index');const header=source.key&&!source.key.startsWith('linked:')?await vault().assets.header(source.key):null;if(!canIndexRagScope(scope,header?.scope))throw Error('This protected source belongs to another privacy scope and is excluded from RAG')}
}
export async function ragStatus(id:string){const settings=await loadRagSettings(id),parsed=RagIndexSchema.nullable().safeParse(await get(id,RAG_ROOT+'index.json'));return {settings,authorized:await ragAuthorized(id,settings),index:parsed.success?parsed.data:null,running:jobs.has(id),error:parsed.success?failures.get(id)?.error:'Invalid RAG index'}}
async function engine(id:string,settings:RagSettings){
  const saved=ragProvider(settings),authority=JSON.stringify([saved.host,saved.saved.apiKey,settings.ocr?settingsStore.getState().getSettings().providers?.[settings.ocrProvider]:null])
  const check=async()=>{await vault().projects.assertSession(id);const current=await loadRagSettings(id),provider=ragProvider(current);if(!await ragAuthorized(id,current)||consent(current)!==consent(settings)||JSON.stringify([provider.host,provider.saved.apiKey,current.ocr?settingsStore.getState().getSettings().providers?.[current.ocrProvider]:null])!==authority)throw Error('RAG settings changed; start the operation again')}
  let snapshot:Awaited<ReturnType<typeof listSessionResources>>['items']|undefined
  const port:RagEnginePort={
    check,
    list:async()=>{const result=await listSessionResources(id);snapshot=result.items;if(result.truncated)throw Error('File listing is incomplete; reduce the session tree before indexing');return result.items},
    read:async path=>{await check();const file=(snapshot||(await listSessionResources(id)).items).find(file=>file.path===path);if(!file)throw Error('Session file not found');const header=file.key&&!file.key.startsWith('linked:')?await vault().assets.header(file.key):null;if(!canIndexRagScope(await vault().projects.sessionScope(id)||undefined,header?.scope))throw Error('This protected source belongs to another privacy scope and is excluded from RAG');if(file.key?.startsWith('linked:'))return (await (await import('@/packages/session-resources/linked-folder')).readMounted(file.key))!;return (await readSessionResource(id,file)).bytes},
    get:path=>get(id,path),put:(path,value)=>put(id,path,value),
    remove:async path=>{const file=(await sessionFiles.list(id,true)).find(file=>file.path===path);if(file)await sessionFiles.remove(id,file.id,[],true)},
    extract:extractRagSource,
    embed:async(input,query,cfg,signal)=>{await check();const result=await requestRagEmbeddings(input,query,cfg,signal);await check();return result},
  }
  await check();return new SessionRagEngine(port)
}
export async function indexSessionRag(id:string){
  if(jobs.has(id))throw Error('RAG indexing is already running')
  const settings=await loadRagSettings(id);if(!await ragAuthorized(id,settings))throw Error('Enable RAG on this device before indexing')
  failures.delete(id);const job={controller:new AbortController(),path:''};jobs.set(id,job);notify()
  const unsubscribe=vault().keys.subscribe(()=>job.controller.abort())
  const locked=()=>job.controller.abort(),hidden=()=>{if(document.hidden)locked()};window.addEventListener('chatbox:privacy-lock',locked);document.addEventListener('visibilitychange',hidden)
  try{return await (await engine(id,settings)).index(settings,job.controller.signal,path=>{job.path=path;notify()})}
  finally{unsubscribe();jobs.delete(id);window.removeEventListener('chatbox:privacy-lock',locked);document.removeEventListener('visibilitychange',hidden);resourcesChanged(id);notify()}
}
export function cancelSessionRag(id:string){jobs.get(id)?.controller.abort()}
export async function clearSessionRag(id:string){if(jobs.has(id))throw Error('Stop indexing before clearing the index');for(const file of await sessionFiles.list(id,true))if(file.path.startsWith(RAG_ROOT)&&!file.path.endsWith('/settings.json'))await sessionFiles.remove(id,file.id,[],true);resourcesChanged(id);notify()}
export async function searchSessionRag(id:string,query:string,signal:AbortSignal,limit=8){const settings=await loadRagSettings(id);return (await engine(id,settings)).search(query,settings,signal,limit)}
export async function readSessionRag(id:string,ids:string[],signal:AbortSignal){const settings=await loadRagSettings(id);return (await engine(id,settings)).retrieve(ids,settings,signal)}
let started=false,scanning=false
const fingerprints=new Map<string,string>()
export function startRagMonitoring(){if(started)return;started=true
  const tick=async()=>{if(scanning||document.hidden)return;scanning=true;try{for(const id of await vault().db.getSetting<string[]>('rag:auto-sessions')||[]){if(jobs.has(id))continue;let key='';try{const cfg=await loadRagSettings(id);if(!cfg.auto||!await ragAuthorized(id,cfg))continue;const tree=await listSessionResources(id);key=JSON.stringify([cfg,tree.items.filter(file=>!file.path.startsWith(RAG_ROOT)).map(file=>[file.path,file.key,file.updatedAt,file.bytes])]);if(fingerprints.get(id)===key||failures.get(id)?.key===key)continue;await indexSessionRag(id);fingerprints.set(id,key)}catch(error){failures.set(id,{key,error:String((error as Error).message).slice(0,500)});notify()}}}catch{/* Device/database is not ready or has been locked. No provider call is made. */}finally{scanning=false}}
  setInterval(()=>void tick(),15000);void tick()
}

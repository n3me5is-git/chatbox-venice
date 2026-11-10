import type { Platform } from '@/platform/interfaces'
import type { ImageGenerationStorage } from '@/storage/ImageGenerationStorage'
import sanitizeFilename from 'sanitize-filename'
import { deviceProtector } from '../vault/device'
import { IndexedArchiveCatalog } from './catalog'
import { ArchiveBusy,ArchiveEngine } from './engine'
import { archiveStorageSupported,NativeArchiveDisk } from './native'
import { ArchiveRows } from './rows'
const runtimes=new WeakMap<Platform,ArchiveRuntime>()
const VALUE=(key:string)=>key.startsWith('session:')||key==='venice:media:records:v1'
const encoder=new TextEncoder()
export class ArchiveRuntime {
  beforeMigrate:()=>Promise<void>=async()=>{}
  readonly engine:ArchiveEngine;readonly disk:NativeArchiveDisk;readonly rows:ArchiveRows
  private readonly images:ImageGenerationStorage
  private active=0;private frozen=false;private recovered?:Promise<void>
  private epoch=0;private garbage?:Promise<void>;private garbageTimer?:ReturnType<typeof setTimeout>
  private readonly raw:{get:(key:string)=>Promise<string|null>;set:(key:string,value:string)=>Promise<void>;remove:(key:string)=>Promise<void>;keys:()=>Promise<string[]>}
  private readonly values:{get:Platform['getStoreValue'];set:Platform['setStoreValue'];remove:Platform['delStoreValue'];keys:Platform['getAllStoreKeys']}
  private readonly listeners=new Set<()=>void>()
  constructor(readonly platform:Platform){
    this.images=platform.getImageGenerationStorage()
    this.raw={get:platform.getStoreBlob.bind(platform),set:platform.setStoreBlob.bind(platform),remove:platform.delStoreBlob.bind(platform),keys:platform.listStoreBlobKeys.bind(platform)}
    this.values={get:platform.getStoreValue.bind(platform),set:platform.setStoreValue.bind(platform),remove:platform.delStoreValue.bind(platform),keys:platform.getAllStoreKeys.bind(platform)}
    this.disk=new NativeArchiveDisk(this.raw);const device=deviceProtector();this.engine=new ArchiveEngine(new IndexedArchiveCatalog(),this.disk,{protect:value=>device.protect(value,false),unprotect:value=>device.unprotect(value)})
    this.engine.onChange=()=>this.emit();this.rows=new ArchiveRows(platform.getSessionRowStore(),this.engine,work=>this.guard(work))
    this.rows.onMutation=()=>this.scheduleCleanup()
  }
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener)}}
  private emit(){for(const listener of this.listeners)listener()}
  async startup(){await(this.recovered ||= this.engine.recover().catch(async error=>{if((await this.engine.state()).phase==='cleanup'){await this.disk.check((await this.engine.state()).root);return}this.recovered=undefined;throw error}))}
  async guard<T>(work:()=>Promise<T>):Promise<T>{if(this.garbage)await this.garbage;if(this.frozen)throw new ArchiveBusy();this.epoch++;this.active++;try{await this.startup();await this.engine.ready();return await work()}catch(error){this.emit();throw error}finally{this.active--}}
  private scheduleCleanup(){if(this.garbageTimer)clearTimeout(this.garbageTimer);this.garbageTimer=setTimeout(()=>{this.garbageTimer=undefined;void this.cleanupUnused().catch(()=>{})},2000)}
  /** Metadata-only mark/sweep. Any concurrent data operation invalidates the scan; staged/export reads prevent reclamation. */
  async cleanupUnused(force=false){if(this.active||this.rows.streams||this.rows.writers||this.garbage||this.frozen&&!force)return;const state=await this.engine.state();if(!state.enabled||state.phase&&!force)return
    const epoch=this.epoch,live=new Set<string>(),mark=(value:unknown)=>{if(!value||typeof value!=='object')return;const item=value as Record<string,unknown>;const pointer=item.__chatboxArchive as {key?:string}|undefined;if(pointer?.key)live.add(pointer.key);if(typeof item.taskId==='string'&&/^archive-payload:[a-f0-9-]{36}$/.test(item.taskId))live.add('payload:'+item.taskId.slice(16));for(const value of Object.values(item))if(value&&typeof value==='object')mark(value)}
    for(const id of await this.rows.backend.listSessionIds()){mark(await this.rows.backend.readCommit(id));for await(const row of this.rows.backend.iterateRows({sessionId:id,consistency:'export'}))mark(row)}
    let cursor:number|null=0;while(cursor!==null){const page=await this.images.getPage(cursor,100);for(const image of page.items)mark(image);cursor=page.nextCursor}
    const dead=(await this.engine.catalog.entries()).filter(entry=>entry.key.startsWith('payload:')&&!live.has(entry.key));if(this.active||this.rows.streams||this.rows.writers||this.epoch!==epoch)return
    this.garbage=(async()=>{for(const entry of force?dead:dead.slice(0,64)){if(force){await this.engine.erase(entry.ref);await this.engine.catalog.remove(entry.key)}else await this.engine.remove(entry.key)}})();try{await this.garbage}finally{this.garbage=undefined}if(!force&&dead.length>64)this.scheduleCleanup()
  }
  private blobKey(key:string){return 'blob:'+(this.platform.type==='desktop'?sanitizeFilename(key):key)}
  private async managed(){return (await this.engine.state()).enabled===true}
  async importLegacyBlob(key:string,replace=false){const value=await this.raw.get(key);if(value!==null){if(typeof value!=='string')throw new Error('Unsupported legacy archive value');if(replace)await this.engine.put(this.blobKey(key),value);else await this.engine.prepareValue(this.blobKey(key),value);await this.raw.remove(key)}}
  private async getBlob(key:string){const found=await this.engine.catalog.get(this.blobKey(key));return found?this.engine.readRef(found.key,found.ref):this.raw.get(key)}
  private async setBlob(key:string,value:string){if(await this.managed()||await this.engine.catalog.get(this.blobKey(key))){await this.engine.put(this.blobKey(key),value);await this.raw.remove(key)}else await this.raw.set(key,value)}
  private async getValue(key:string){const entry=VALUE(key)?await this.engine.catalog.get('value:'+key):undefined;return entry?JSON.parse(await this.engine.readRef(entry.key,entry.ref)):this.values.get(key)}
  private async setValue(key:string,value:unknown){if(VALUE(key)&&(await this.managed()||await this.engine.catalog.get('value:'+key))){await this.engine.put('value:'+key,JSON.stringify(value));await this.values.remove(key)}else await this.values.set(key,value)}
  install(){const p=this.platform
    if(p.type==='desktop'&&typeof window!=='undefined'&&window.electronAPI){const ipc=window.electronAPI;ipc.onArchiveBlobRequest?.(request=>{void(async()=>{try{const result=request.action==='get'?await p.getStoreBlob(request.key!):request.action==='set'?await p.setStoreBlob(request.key!,request.value!):request.action==='remove'?await p.delStoreBlob(request.key!):await p.listStoreBlobKeys();await ipc.invoke('archive:blob-reply',request.id,null,result)}catch(error){await ipc.invoke('archive:blob-reply',request.id,error instanceof Error?error.message:String(error),null)}})()});void this.engine.state().then(state=>ipc.invoke('archive:active',state.enabled===true))}
    p.getSessionRowStore=()=>this.rows.port()
    p.getStoreBlob=key=>this.guard(()=>this.getBlob(key))
    p.setStoreBlob=(key,value)=>this.guard(()=>this.setBlob(key,value))
    p.delStoreBlob=key=>this.guard(async()=>{await this.engine.remove(this.blobKey(key));await this.raw.remove(key)})
    p.listStoreBlobKeys=()=>this.guard(async()=>[...new Set([...(await this.raw.keys()).filter(key=>!/^a1-[a-f0-9-]{36}-\d+\.bin$/.test(key)),...(await this.engine.catalog.entries()).filter(e=>e.key.startsWith('blob:')).map(e=>e.key.slice(5))])])
    p.getStoreValue=key=>VALUE(key)?this.guard(()=>this.getValue(key)):this.values.get(key)
    p.setStoreValue=(key,value)=>VALUE(key)?this.guard(()=>this.setValue(key,value)):this.values.set(key,value)
    p.delStoreValue=key=>VALUE(key)?this.guard(async()=>{await this.engine.remove('value:'+key);await this.values.remove(key)}):this.values.remove(key)
    p.getAllStoreKeys=async()=>[...new Set([...await this.values.keys(),...(await this.engine.catalog.entries()).filter(e=>e.key.startsWith('value:')).map(e=>e.key.slice(6))])]
    p.getAllStoreValues=async()=>{const result:Record<string,unknown>={};for(const key of await p.getAllStoreKeys())result[key]=await p.getStoreValue(key);return result}
    p.setAllStoreValues=async values=>{for(const [key,value] of Object.entries(values))await p.setStoreValue(key,value)}
    p.delStoreValues=async keys=>{for(const key of keys)await p.delStoreValue(key)}
    p.copyStoreValue=async(source,destination)=>{const value=await p.getStoreValue(source);if(value===null||value===undefined)return false;await p.setStoreValue(destination,value);return true}
    if(p.resourceFiles){const original=p.resourceFiles;p.resourceFiles={open:key=>this.guard(async()=>{if(!await this.engine.catalog.get(this.blobKey(key)))return original.open(key);const value=await this.getBlob(key);if(value===null)return null;const bytes=encoder.encode(value);return {size:bytes.length,readBytes:async(offset,length)=>bytes.slice(offset,offset+length),close:async()=>{bytes.fill(0)}}}),create:key=>this.guard(async()=>{const sink=await original.create(key);if(!await this.managed())return sink;return {write:bytes=>this.guard(()=>sink.write(bytes)),close:()=>this.guard(async()=>{await sink.close();await this.importLegacyBlob(key,true)}),abort:()=>sink.abort()}})}}
    const images=this.images;p.getImageGenerationStorage=()=>new Proxy(images,{get:(target,key)=>{const original=Reflect.get(target,key);if(typeof original!=='function')return original;return (...args:any[])=>this.guard(async()=>{
      if((key==='create'||key==='update')&&await this.managed()){const previous=key==='update'?await images.getById(args[0]):undefined;if(key==='update'&&!previous)return null;const record=key==='create'?args[0]:{...await this.rows.hydrate(previous),...args[1]};const stub=await this.image(record);args=key==='create'?[stub]:[args[0],stub]}
      const result=await this.rows.hydrate(await original.apply(target,args));if(['create','update','delete'].includes(String(key)))this.scheduleCleanup();return result
    })}})
  }
  private async image(record:any){const id=crypto.randomUUID(),payload='payload:'+id;await this.engine.prepareValue(payload,JSON.stringify(record));return {id:record.id,createdAt:record.createdAt,status:record.status,parentId:record.parentId,model:record.model,source:record.source,protection:record.protection,protectedRecord:record.protectedRecord,prompt:'',referenceImages:[],generatedImages:[],taskId:'archive-payload:'+id}}
  async migrate(target:string){if(this.frozen||this.active||this.rows.writers||this.rows.streams||this.garbage)throw new Error('Finish active operations before migrating storage')
    await this.beforeMigrate()
    const running=await this.rows.backend.findMessagesByStatus('generating');if(running.length)throw new Error('Stop active generations before migrating storage')
    if(this.active||this.rows.writers||this.rows.streams)throw new Error('Finish active operations before migrating storage');this.frozen=true;this.emit()
    try{await this.startup();await this.engine.migrate(target,async()=>{
      await this.engine.catalog.setState({...await this.engine.state(),enabled:true})
      if(this.platform.type==='desktop'&&window.electronAPI)await window.electronAPI.invoke('archive:active',true)
      await this.rows.prepare()
      await this.images.initialize();let cursor:number|null=0;while(cursor!==null){const page=await this.images.getPage(cursor,50);for(const record of page.items)if(!/^archive-payload:[a-f0-9-]{36}$/.test(record.taskId||''))await this.images.update(record.id,await this.image(record));cursor=page.nextCursor}
      for(const key of await this.values.keys())if(VALUE(key)){const value=await this.values.get(key);if(value!==null&&value!==undefined){await this.engine.prepareValue('value:'+key,JSON.stringify(value));await this.values.remove(key)}}
      // Legacy aliases and all existing vault chunks (including KB originals and vector shards) follow one root.
      for(const key of await this.raw.keys())if(!/^a1-[a-f0-9-]{36}-\d+\.bin$/.test(key))await this.importLegacyBlob(key)
      await this.cleanupUnused(true)
    });await this.platform.compactStore?.();await (this.rows.backend as unknown as {compact?:()=>Promise<void>}).compact?.();await (this.images as unknown as {compact?:()=>Promise<void>}).compact?.()}finally{this.frozen=false;this.emit()}
  }
}
export const archiveRuntimeFor=(platform:Platform)=>runtimes.get(platform)
export function installArchiveStorage(platform:Platform){if(!archiveStorageSupported())return;const runtime=new ArchiveRuntime(platform);runtime.beforeMigrate=async()=>{
  const [{rendererApplication},{rendererBackupService},{getImageGenerationService},{veniceMediaService},{sharingBackgroundSnapshot},{hasRagJobs},{knowledgeCollections}]=await Promise.all([import('@/app/renderer-application'),import('@/app/renderer-backup'),import('@/stores/imageGenerationActions'),import('@/packages/venice/service'),import('@/packages/collaboration/background'),import('@/packages/session-rag/service'),import('@/packages/knowledge-collections/service')])
  if(rendererApplication.generationRuntime.getGeneratingSessionIds().length||rendererBackupService.isActive()||getImageGenerationService().getSnapshot().phase!=='idle'||(await veniceMediaService.list()).some(record=>veniceMediaService.isActive(record.id)))throw new Error('Stop active generations and backups before migrating storage')
  if(sharingBackgroundSnapshot().count)throw new Error('Close active shares and transfers before migrating storage')
  if(hasRagJobs()||knowledgeCollections.hasActiveJobs())throw new Error('Stop indexing before migrating storage')
};runtimes.set(platform,runtime);runtime.install()}

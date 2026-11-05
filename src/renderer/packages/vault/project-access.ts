import type { SessionMetaRepositoryPort,SessionRowStorePort } from '@chatbox/core/ports'
import type { SessionMetaRecord } from '@shared/types'
import { VaultLockedError } from './chunk-store'
import type { KeySettings,VaultKeys } from './keys'
import { forkT as ft } from '@/i18n/fork'
type Policy={mode:'app'|'pin';scope:string}
type Policies=Record<string,Policy>
const POLICY='project-access-v1'
/** Access boundaries for existing chat stores. This does not claim to encrypt ordinary conversation databases. */
export class ProjectAccess {
  private cached:Promise<Policies>|undefined
  constructor(readonly settings:KeySettings,readonly keys:VaultKeys,readonly metadata:SessionMetaRepositoryPort,private readonly readValue:(key:string)=>Promise<unknown>){keys.subscribe(()=>{this.cached=undefined})}
  policies(){return this.cached ||= this.settings.getSetting<Policies>(POLICY).then(value=>value||{})}
  async folderScope(id?:string){return id?(await this.policies())[id]?.scope:null}
  async sessionScope(id:string){if(!id||id==='new')return null;await this.metadata.initialize();const meta=await this.metadata.getById(id);if(meta)return this.folderScope(meta.folderId);const record=await this.readValue('session:'+id) as {folderId?:string}|null;return this.folderScope(record?.folderId)}
  async assertFolder(id?:string){const scope=await this.folderScope(id);if(scope&&!this.keys.isUnlocked(scope))throw new VaultLockedError(scope)}
  async assertSession(id:string){const scope=await this.sessionScope(id);if(scope&&!this.keys.isUnlocked(scope))throw new VaultLockedError(scope)}
  async setPolicy(folderId:string,mode:'none'|'app'|'pin',pin?:string){
    if(!folderId)throw new Error('Select a project');const previous=(await this.policies())[folderId];if(previous)await this.keys.key(previous.scope)
    let policy:Policy|undefined
    if(mode==='app'){await this.keys.key('app');policy={mode,scope:'app'}}
    if(mode==='pin'){const scope='project:'+folderId;const status=await this.keys.status(scope);if(pin)await this.keys.configure(scope,{pin,biometric:false});else if(status.configured)await this.keys.key(scope);else throw new Error('Enter a dedicated project PIN');policy={mode,scope}}
    const next={...await this.policies()};if(policy)next[folderId]=policy;else delete next[folderId];await this.settings.setSetting(POLICY,next);this.cached=undefined;this.keys.refresh()
  }
  async redact(meta:SessionMetaRecord){const scope=await this.folderScope(meta.folderId);if(!scope||this.keys.isUnlocked(scope))return meta
    return {id:meta.id,name:ft('Protected chat'),folderId:meta.folderId,sortOrder:meta.sortOrder,createdAt:meta.createdAt,type:meta.type,starred:meta.starred,hidden:meta.hidden,archivedAt:meta.archivedAt} as SessionMetaRecord
  }
  protectMetadata():SessionMetaRepositoryPort {
    const access=this,backend=this.metadata
    return new Proxy(backend,{get(target,key){const original=Reflect.get(target,key);if(typeof original!=='function')return original;const method=String(key)
      if(method==='iterateIds')return async function*(){for await(const id of backend.iterateIds!())yield id}
      return async(...args:any[])=>{
        if(method==='create'||method==='createMany'){for(const record of method==='create'?[args[0]]:args[0]){await access.assertSession(record.id);await access.assertFolder(record.folderId)}}
        if(method==='update'){await access.assertSession(args[0]);if(Object.hasOwn(args[1],'folderId'))await access.assertFolder(args[1].folderId)}
        if(method==='delete'||method==='deleteMany')for(const id of method==='delete'?[args[0]]:args[0])await access.assertSession(id)
        if(method==='clear')for(const id of Object.keys(await access.policies()))await access.assertFolder(id)
        const result=await original.apply(target,args)
        if(method==='getById')return result?access.redact(result):null
        if(['getAll','getAllIncludingHidden','getArchived'].includes(method))return Promise.all(result.map((meta:SessionMetaRecord)=>access.redact(meta)))
        if(['getPage','getArchivedPage'].includes(method))return {...result,items:await Promise.all(result.items.map((meta:SessionMetaRecord)=>access.redact(meta)))}
        return result
      }
    }})
  }
  protectRows(backend:SessionRowStorePort):SessionRowStorePort {
    const access=this
    const identity=(value:any):string|undefined=>typeof value==='string'?value:value?.sessionId||value?.identity?.sessionId||value?.source?.sessionId||value?.rows?.sessionId||value?.record?.id||value?.id
    const guard=async(args:any[])=>{const first=args[0];for(const value of Array.isArray(first)?first:[first]){const id=identity(value);if(!id)throw new Error('Cannot determine the project access boundary for this operation');await access.assertSession(id);await access.assertFolder(value?.folderId||value?.record?.folderId)}}
    const writer=(value:any,sessionId:string)=>new Proxy(value,{get(target,key){const original=Reflect.get(target,key);if(typeof original!=='function')return original;return async(...args:any[])=>{if(key!=='dispose')await access.assertSession(sessionId);return original.apply(target,args)}}})
    return new Proxy(backend,{get(target,key){const original=Reflect.get(target,key);if(typeof original!=='function')return original;const method=String(key)
      if(method==='initialize')return original.bind(target)
      if(method==='iterateRows')return async function*(request:any){await access.assertSession(request.sessionId);for await(const row of original.call(target,request)){await access.assertSession(request.sessionId);yield row}}
      return async(...args:any[])=>{
        if(method==='listSessionIds'){const ids=await original.apply(target,args);const result:string[]=[];for(const id of ids){const scope=await access.sessionScope(id);if(!scope||access.keys.isUnlocked(scope))result.push(id)}return result}
        if(method==='findMessagesByStatus'){const refs=await original.apply(target,args);const result=[];for(const ref of refs){const scope=await access.sessionScope(ref.sessionId);if(!scope||access.keys.isUnlocked(scope))result.push(ref)}return result}
        if(method==='disposeImportRows'){// Candidate identities are not published sessions; disposal only removes temporary state.
          return original.apply(target,args)
        }
        await guard(args);const result=await original.apply(target,args)
        if(method==='stageRows'||method==='stageImportRows')return writer(result,identity(args[0])!)
        return result
      }
    }})
  }
}

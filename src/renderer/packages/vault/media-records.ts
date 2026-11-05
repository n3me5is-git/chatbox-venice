import type { MediaRecord } from '@shared/providers/definitions/models/venice/media'
import type { VaultRuntime } from './runtime'
import { VaultJsonRecords } from './json-records'
import { VaultLockedError } from './chunk-store'
interface Store {read():Promise<MediaRecord[]>;write(records:MediaRecord[]):Promise<void>}
const alias=(id:string)=>`vault-media-record-${id}`
export const lockedMediaRecord=(record:MediaRecord):MediaRecord=>({id:record.id,kind:record.kind,model:'',prompt:'',createdAt:record.createdAt,sessionId:record.sessionId,status:'ready',origin:'',credentialId:'',protection:record.protection,protectedRecord:true})
export class ProtectedMediaRecords {
  private readonly records:VaultJsonRecords;private readonly clean=new WeakSet<MediaRecord>();private tail:Promise<unknown>=Promise.resolve()
  constructor(private readonly original:Store,private readonly vault:VaultRuntime){this.records=new VaultJsonRecords(vault.assets)}
  private serial<T>(work:()=>Promise<T>){const next=this.tail.then(work,work);this.tail=next.catch(()=>{});return next}
  async read(){const rows=await this.original.read();const result:MediaRecord[]=[];for(const record of rows){if(!record.protection){result.push(record);continue}if(!this.vault.keys.isUnlocked(record.protection)){result.push(lockedMediaRecord(record));continue}const full=await this.records.get<MediaRecord>(alias(record.id));if(!full)throw new Error('Protected media metadata is missing');this.clean.add(full);result.push(full)}return result}
  async get(id:string){const record=(await this.original.read()).find(record=>record.id===id);if(!record)return null;if(!record.protection)return record;if(!this.vault.keys.isUnlocked(record.protection))return lockedMediaRecord(record);const full=await this.records.get<MediaRecord>(alias(id));await this.vault.keys.key(record.protection);return full}
  write(records:MediaRecord[]){return this.serial(()=>this.writeNow(records))}
  private async writeNow(records:MediaRecord[],changeScope?:string){const previous=await this.original.read();const old=new Map(previous.map(record=>[record.id,record]));const incomingIds=new Set(records.map(record=>record.id));const output:MediaRecord[]=[];const changes:Array<{commit:()=>Promise<void>;rollback:()=>Promise<void>}>=[]
    try{
    for(const record of previous)if(record.protection&&!incomingIds.has(record.id))await this.vault.keys.key(record.protection)
    for(const incoming of records){const current=old.get(incoming.id);const scope=current&&changeScope!==incoming.id?current.protection:incoming.protection
      if(incoming.protectedRecord){if(!current?.protection||JSON.stringify(incoming)!==JSON.stringify(lockedMediaRecord(current)))throw new VaultLockedError(current?.protection||'app');output.push(current);continue}
      if(scope){await this.vault.keys.key(scope);if(!this.clean.has(incoming)||incoming.protection!==scope||current?.protection!==scope){changes.push(await this.records.prepare(alias(incoming.id),{...incoming,protection:scope,protectedRecord:false},scope))}output.push(lockedMediaRecord({...incoming,protection:scope}))}
      else output.push({...incoming,protection:undefined,protectedRecord:false})
    }
    await this.original.write(output)
    for(const change of changes)await change.commit()
    const published=new Map(output.map(record=>[record.id,record]));for(const record of previous)if(record.protection&&!published.get(record.id)?.protection)await this.records.remove(alias(record.id)).catch(()=>{})
    }catch(error){for(const change of changes.reverse())await change.rollback().catch(()=>{});throw error}
  }
  setProtection(id:string,scope?:string){return this.serial(async()=>{const rows=await this.read();const record=rows.find(record=>record.id===id);if(!record)throw new Error('Media generation not found');if(record.protectedRecord)throw new VaultLockedError(record.protection!);if(scope)await this.vault.keys.key(scope);if(record.protection)await this.vault.keys.key(record.protection)
    let previous=record.blobKey?await this.vault.find(record.blobKey):null
    try{if(record.blobKey&&!previous){await this.vault.migrate(record.blobKey);previous=await this.vault.find(record.blobKey)}if(record.blobKey){if(!previous)throw new Error('This media file is no longer available');await this.vault.assets.rewrap(`vault-asset-${previous.id}`,scope||'public')}await this.writeNow(rows.map(item=>item.id===id?{...record,protection:scope}:item),id)}catch(error){if(previous)await this.vault.assets.index.put(previous).catch(()=>{});throw error}
  })}
}

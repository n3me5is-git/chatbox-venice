import type { ImageGeneration } from '@shared/types'
import type { ImageGenerationStorage } from '@/storage/ImageGenerationStorage'
import type { VaultRuntime } from './runtime'
import { VaultJsonRecords } from './json-records'
import { VaultLockedError } from './chunk-store'
const alias=(id:string)=>`vault-image-record-${id}`
export function lockedImageRecord(record:ImageGeneration):ImageGeneration{return {id:record.id,createdAt:record.createdAt,protection:record.protection,protectedRecord:true,prompt:'',referenceImages:[],generatedImages:[],model:{provider:record.model.provider,modelId:''},status:'done'}}
export class ProtectedImageRecords implements ImageGenerationStorage {
  private readonly records:VaultJsonRecords;private tail:Promise<unknown>=Promise.resolve()
  constructor(readonly original:ImageGenerationStorage,private readonly vault:VaultRuntime){this.records=new VaultJsonRecords(vault.assets)}
  private serialize<T>(work:()=>Promise<T>){const next=this.tail.then(work,work);this.tail=next.catch(()=>{});return next}
  initialize(){return this.original.initialize()}
  async getById(id:string){const record=await this.original.getById(id);if(!record?.protection)return record;if(!this.vault.keys.isUnlocked(record.protection))return lockedImageRecord(record);const full=await this.records.get<ImageGeneration>(alias(id));if(!full)throw new Error('Protected image metadata is missing');return full}
  create(record:ImageGeneration){return this.serialize(async()=>{if(!record.protection){await this.original.create(record);return}await this.vault.keys.key(record.protection);await this.records.set(alias(record.id),{...record,protectedRecord:false},record.protection);try{await this.original.create(lockedImageRecord(record))}catch(error){await this.records.remove(alias(record.id));throw error}})}
  update(id:string,updates:Partial<ImageGeneration>){return this.serialize(async()=>{const raw=await this.original.getById(id);if(!raw)return null;if(raw.protection&&!this.vault.keys.isUnlocked(raw.protection))throw new VaultLockedError(raw.protection);const existing=await this.getById(id);if(!existing)return null;const record={...existing,...updates,protectedRecord:false}
    if(record.protection){await this.vault.keys.key(record.protection);const previous=new Map<string,string>()
      try{
        await this.records.set(alias(id),record,record.protection)
        for(const key of [...record.generatedImages,...record.generatedImageThumbnails||[]]){if(/^https?:/.test(key))throw new Error('Save generated images on this device before protecting the session');let header=await this.vault.find(key);if(!header){await this.vault.migrate(key);header=await this.vault.find(key)}if(header&&header.scope!==record.protection){previous.set(`vault-asset-${header.id}`,header.scope);await this.vault.assets.rewrap(`vault-asset-${header.id}`,record.protection)}}
        await this.original.update(id,{...Object.fromEntries(Object.keys(raw).map(key=>[key,undefined])),...lockedImageRecord(record)});return record
      }catch(error){for(const [ref,scope] of previous)await this.vault.assets.rewrap(ref,scope).catch(()=>{});if(raw.protection)await this.records.set(alias(id),existing,raw.protection).catch(()=>{});else await this.records.remove(alias(id)).catch(()=>{});throw error}
    }
    // Unlocking the old scope is required before publishing any plaintext metadata.
    for(const key of [...record.generatedImages,...record.generatedImageThumbnails||[]]){const header=await this.vault.find(key);if(header?.scope&&header.scope!=='public')await this.vault.assets.rewrap(`vault-asset-${header.id}`,'public')}
    const saved=await this.original.update(id,record);if(raw.protection)await this.records.remove(alias(id));return saved
  })}
  delete(id:string){return this.serialize(async()=>{const raw=await this.original.getById(id);if(raw?.protection&&!this.vault.keys.isUnlocked(raw.protection))throw new VaultLockedError(raw.protection);await this.original.delete(id);await this.records.remove(alias(id))})}
  async getPage(cursor:number,limit?:number){const page=await this.original.getPage(cursor,limit);const items:ImageGeneration[]=[];for(const record of page.items)items.push(await this.getById(record.id)||record);return {...page,items}}
  getTotal(){return this.original.getTotal()}
}

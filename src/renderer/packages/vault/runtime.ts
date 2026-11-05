import type { Platform } from '@/platform/interfaces'
import { trackBlobWrite } from '@/storage/blob-write-tracker'
import { EncryptedChunkStore,VaultLockedError,dataUrlBytes,responseBytes,type AssetInfo } from './chunk-store'
import { VaultDatabase } from './database'
import { deviceProtector } from './device'
import { VaultKeys } from './keys'
import { ProtectedImageRecords } from './image-records'
import { ProjectAccess } from './project-access'
import { ProtectedMediaRecords } from './media-records'
import type { MediaRecord } from '@shared/providers/definitions/models/venice/media'
const runtimes=new WeakMap<Platform,VaultRuntime>()
const mimeInfo=(mime:string,name='Saved content'):AssetInfo=>({name,mime,kind:mime.startsWith('image/')?'image':mime.startsWith('video/')?'video':mime.startsWith('audio/')?'audio':'document'})
export class VaultRuntime {
  readonly db=new VaultDatabase();readonly keys=new VaultKeys(this.db,deviceProtector());readonly assets:EncryptedChunkStore
  readonly legacy:{get:(key:string)=>Promise<string|null>;set:(key:string,value:string)=>Promise<void>;remove:(key:string)=>Promise<void>;keys:()=>Promise<string[]>}
  private ready:Promise<boolean>|undefined
  projects!:ProjectAccess
  media!:ProtectedMediaRecords
  constructor(private readonly platform:Platform){this.legacy={get:platform.getStoreBlob.bind(platform),set:platform.setStoreBlob.bind(platform),remove:platform.delStoreBlob.bind(platform),keys:platform.listStoreBlobKeys.bind(platform)};this.assets=new EncryptedChunkStore(this.legacy,this.db,async scope=>{await this.projects?.assertApp();return this.keys.key(scope)})}
  async find(alias:string){return await this.assets.header(alias)||(this.platform.type==='desktop'&&alias.includes(':')?this.db.byAlias(alias.replace(/:/g,'')):null)}
  available(){return this.ready ||= (async()=>{
    // Once data exists, losing the device key is an error, never a plaintext fallback.
    if(await this.db.getSetting('scope:public')){await this.keys.key('public');return true}
    if(!(await this.keys.capabilities()).encryption)return false
    await this.keys.key('public');return true
  })().catch(error=>{this.ready=undefined;throw error})}
  async putStream(alias:string,response:Response,mime:string,signal?:AbortSignal){if(!await this.available())return false
    if(Number(response.headers.get('content-length')||0)>this.assets.maximum){await response.body?.cancel();throw new Error('Media exceeds the encrypted library size limit')}
    trackBlobWrite(alias);const previous=await this.db.byAlias(alias)
    const record=alias.startsWith('venice-media:')?await this.media?.get(alias.slice(13)):null
    const info={...mimeInfo(mime),...(record?{name:record.prompt.slice(0,100)||record.model,prompt:record.prompt,model:record.model,sourceId:record.id}:{})}
    try{await this.assets.put(responseBytes(response,signal),info,record?.protection||'public',alias,signal)}catch(error){await response.body?.cancel().catch(()=>{});throw error}
    if(previous)await this.assets.remove(`vault-asset-${previous.id}`)
    await this.legacy.remove(alias);return true
  }
  async migrate(alias:string){if(!await this.available())throw new Error('Device encryption is unavailable');if(await this.db.byAlias(alias))return false
    const value=await this.legacy.get(alias);const mime=/^data:((?:image|audio|video)\/[^;,]+);base64,/.exec(value||'')?.[1];if(!value||!mime)return false
    const imageId=/^picture(?::)?image-gen(?::)?([a-f0-9-]{36})/.exec(alias)?.[1],mediaId=/^venice-media(?::)?([a-f0-9-]{36})/.exec(alias)?.[1]
    const record=imageId?await this.platform.getImageGenerationStorage().getById(imageId):mediaId?await this.media?.get(mediaId):null
    const info={...mimeInfo(mime),...(record?{name:record.prompt.slice(0,100)||'Saved content',prompt:record.prompt,model:typeof record.model==='object'?record.model.modelId:String(record.model),sourceId:record.id}:{})}
    const ref=await this.assets.put(dataUrlBytes(value),info,'public',alias)
    // Read/authenticate every block before deleting a legacy copy.
    for await(const bytes of this.assets.read(ref))bytes.fill(0)
    await this.legacy.remove(alias);return true
  }
  install(platform:Platform){
    const getValue=platform.getStoreValue.bind(platform),setValue=platform.setStoreValue.bind(platform),removeValue=platform.delStoreValue.bind(platform),getAll=platform.getAllStoreValues.bind(platform),setAll=platform.setAllStoreValues.bind(platform)
    const mediaKey='venice:media:records:v1';this.media=new ProtectedMediaRecords({read:async()=>{const value=await getValue(mediaKey);return Array.isArray(value)?value as MediaRecord[]:[]},write:records=>setValue(mediaKey,records)},this)
    const meta=platform.getSessionMetaStorage(),rows=platform.getSessionRowStore();this.projects=new ProjectAccess(this.db,this.keys,meta,getValue)
    const guardedMeta=this.projects.protectMetadata(),guardedRows=this.projects.protectRows(rows);platform.getSessionMetaStorage=()=>guardedMeta;platform.getSessionRowStore=()=>guardedRows
    const sessionGuard=async(key:string)=>{if(key.startsWith('session:'))await this.projects.assertSession(key.slice(8))}
    platform.getStoreValue=async key=>{if(key===mediaKey)return this.media.read();await sessionGuard(key);const result=await getValue(key);await sessionGuard(key);return result}
    platform.setStoreValue=async(key,value)=>{if(key===mediaKey){if(!Array.isArray(value))throw new Error('Invalid media records');return this.media.write(value)}await sessionGuard(key);return setValue(key,value)}
    platform.delStoreValue=async key=>{await sessionGuard(key);return removeValue(key)}
    platform.getAllStoreValues=async()=>{const values=await getAll();for(const key of Object.keys(values)){if(!key.startsWith('session:'))continue;const scope=await this.projects.sessionScope(key.slice(8));if(scope&&!this.keys.isUnlocked(scope))delete values[key]}return values}
    platform.setAllStoreValues=async values=>{for(const key of Object.keys(values))await sessionGuard(key);return setAll(values)}
    if(platform.delStoreValues){const original=platform.delStoreValues.bind(platform);platform.delStoreValues=async keys=>{for(const key of keys)await sessionGuard(key);return original(keys)}}
    if(platform.copyStoreValue){const original=platform.copyStoreValue.bind(platform);platform.copyStoreValue=async(source,destination)=>{await sessionGuard(source);await sessionGuard(destination);return original(source,destination)}}
    const images=platform.getImageGenerationStorage();const protectedImages=new ProtectedImageRecords(images,this);platform.getImageGenerationStorage=()=>protectedImages
    platform.getStoreBlob=async alias=>{await this.projects.assertApp();const header=await this.find(alias);const value=header?await this.assets.dataUrl(`vault-asset-${header.id}`):await this.legacy.get(alias);await this.projects.assertApp();return value}
    platform.setStoreBlob=async(alias,value)=>{const mime=/^data:((?:image|audio|video)\/[^;,]+);base64,/.exec(value)?.[1]
      if(!mime||!await this.available()){await this.legacy.set(alias,value);return}
      const previous=await this.find(alias);const recordId=/^picture:image-gen:([^:]+):/.exec(alias)?.[1];const record=recordId?await protectedImages.getById(recordId):null
      const info={...mimeInfo(mime),...(record?{name:record.prompt.slice(0,100)||'Saved image',prompt:record.prompt,model:record.model.modelId,sourceId:record.id}:{})}
      await this.assets.put(dataUrlBytes(value),info,previous?.scope||record?.protection||'public',alias)
      if(previous)await this.assets.remove(`vault-asset-${previous.id}`);await this.legacy.remove(alias)
    }
    platform.delStoreBlob=async alias=>{await this.projects.assertApp();const header=await this.find(alias);if(header){if(header.scope!=='public'&&!this.keys.isUnlocked(header.scope))throw new VaultLockedError(header.scope);await this.assets.remove(`vault-asset-${header.id}`)}await this.legacy.remove(alias)}
    platform.listStoreBlobKeys=async()=>[...new Set([...(await this.legacy.keys()).filter(key=>!/^vault-v1-[a-f0-9-]{36}-chunk-\d+$/.test(key)),...await this.db.aliases()])]
  }
}
export function vaultRuntimeFor(platform:Platform){let runtime=runtimes.get(platform);if(!runtime){runtime=new VaultRuntime(platform);runtimes.set(platform,runtime)}return runtime}
export const installedVaultFor=(platform:Platform)=>runtimes.get(platform)
export function installVaultStorage(platform:Platform){vaultRuntimeFor(platform).install(platform)}

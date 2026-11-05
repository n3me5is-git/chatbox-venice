import type { Platform } from '@/platform/interfaces'
import { trackBlobWrite } from '@/storage/blob-write-tracker'
import { EncryptedChunkStore,dataUrlBytes,responseBytes,type AssetInfo } from './chunk-store'
import { VaultDatabase } from './database'
import { deviceProtector } from './device'
import { VaultKeys } from './keys'
const runtimes=new WeakMap<Platform,VaultRuntime>()
const mimeInfo=(mime:string,name='Saved content'):AssetInfo=>({name,mime,kind:mime.startsWith('image/')?'image':mime.startsWith('video/')?'video':mime.startsWith('audio/')?'audio':'document'})
export class VaultRuntime {
  readonly db=new VaultDatabase();readonly keys=new VaultKeys(this.db,deviceProtector());readonly assets:EncryptedChunkStore
  readonly legacy:{get:(key:string)=>Promise<string|null>;set:(key:string,value:string)=>Promise<void>;remove:(key:string)=>Promise<void>;keys:()=>Promise<string[]>}
  private ready:Promise<boolean>|undefined
  constructor(private readonly platform:Platform){this.legacy={get:platform.getStoreBlob.bind(platform),set:platform.setStoreBlob.bind(platform),remove:platform.delStoreBlob.bind(platform),keys:platform.listStoreBlobKeys.bind(platform)};this.assets=new EncryptedChunkStore(this.legacy,this.db,scope=>this.keys.key(scope))}
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
    await this.assets.put(responseBytes(response,signal),mimeInfo(mime),'public',alias,signal)
    if(previous)await this.assets.remove(`vault-asset-${previous.id}`)
    await this.legacy.remove(alias);return true
  }
  async migrate(alias:string){if(!await this.available())throw new Error('Device encryption is unavailable');if(await this.db.byAlias(alias))return false
    const value=await this.legacy.get(alias);const mime=/^data:((?:image|audio|video)\/[^;,]+);base64,/.exec(value||'')?.[1];if(!value||!mime)return false
    const ref=await this.assets.put(dataUrlBytes(value),mimeInfo(mime),'public',alias)
    // Read/authenticate every block before deleting a legacy copy.
    for await(const bytes of this.assets.read(ref))bytes.fill(0)
    await this.legacy.remove(alias);return true
  }
  install(platform:Platform){
    platform.getStoreBlob=async alias=>{const header=await this.find(alias);return header?this.assets.dataUrl(`vault-asset-${header.id}`):this.legacy.get(alias)}
    platform.setStoreBlob=async(alias,value)=>{const mime=/^data:((?:image|audio|video)\/[^;,]+);base64,/.exec(value)?.[1]
      if(!mime||!await this.available()){await this.legacy.set(alias,value);return}
      const previous=await this.find(alias);await this.assets.put(dataUrlBytes(value),mimeInfo(mime),previous?.scope||'public',alias)
      if(previous)await this.assets.remove(`vault-asset-${previous.id}`);await this.legacy.remove(alias)
    }
    platform.delStoreBlob=async alias=>{const header=await this.find(alias);if(header)await this.assets.remove(`vault-asset-${header.id}`);await this.legacy.remove(alias)}
    platform.listStoreBlobKeys=async()=>[...new Set([...(await this.legacy.keys()).filter(key=>!/^vault-v1-[a-f0-9-]{36}-chunk-\d+$/.test(key)),...await this.db.aliases()])]
  }
}
export function vaultRuntimeFor(platform:Platform){let runtime=runtimes.get(platform);if(!runtime){runtime=new VaultRuntime(platform);runtimes.set(platform,runtime)}return runtime}
export function installVaultStorage(platform:Platform){vaultRuntimeFor(platform).install(platform)}

import { aesKey,decode64,encode64,open,pinKey,seal,type SealedBytes } from './crypto'
import { VaultLockedError } from './chunk-store'
import type { DeviceCapabilities,DeviceProtector } from './device'
export interface KeySettings {getSetting<T>(key:string):Promise<T|null>;setSetting<T>(key:string,value:T):Promise<void>}
type ScopeRecord={version:1;id:string;device?:string;pin?:{salt:string;envelope:string};biometric?:string;failures?:number;retryAt?:number}
export type UnlockStatus={configured:boolean;pin:boolean;biometric:boolean;unlocked:boolean;retryAt:number}
const validPin=(pin:string)=>{if(!/^\d{6,64}$/.test(pin)&&pin.length<10)throw new Error('Use at least 6 PIN digits or a passphrase of 10 characters')}
/** Keys are exported only transiently to authenticated device/PIN envelopes. No plaintext key is persisted. */
export class VaultKeys {
  private keys=new Map<string,CryptoKey>();private running:Promise<unknown>=Promise.resolve();private listeners=new Set<()=>void>();private revision=0;private lockEpoch=0
  constructor(readonly settings:KeySettings,readonly device:DeviceProtector){}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
  snapshot=()=>this.revision
  refresh(){this.changed()}
  private changed(){this.revision++;for(const listener of this.listeners)listener()}
  private serial<T>(work:()=>Promise<T>):Promise<T>{const next=this.running.then(work,work);this.running=next.catch(()=>{});return next}
  private record(scope:string){return this.settings.getSetting<ScopeRecord>(`scope:${scope}`)}
  async capabilities():Promise<DeviceCapabilities>{return this.device.capabilities()}
  async status(scope='app'):Promise<UnlockStatus>{const record=await this.record(scope);return {configured:!!record,pin:!!record?.pin,biometric:!!record?.biometric,unlocked:this.keys.has(scope),retryAt:record?.retryAt||0}}
  isUnlocked(scope:string){return scope==='public'||this.keys.has(scope)}
  unlockedScopes(){return [...this.keys.keys()].filter(scope=>scope!=='public').sort()}
  async key(scope:string):Promise<CryptoKey>{if(this.keys.has(scope))return this.keys.get(scope)!;if(scope!=='public')throw new VaultLockedError(scope)
    return this.serial(async()=>{if(this.keys.has(scope))return this.keys.get(scope)!;let record=await this.record(scope)
      if(!record){if(!(await this.device.capabilities()).encryption)throw new Error('Device encryption is unavailable. Configure a device screen lock first.');const raw=crypto.getRandomValues(new Uint8Array(32));try{record={version:1,id:scope,device:await this.device.protect(encode64(raw),false)};await this.settings.setSetting(`scope:${scope}`,record);const key=await aesKey(raw,true);this.keys.set(scope,key);return key}finally{raw.fill(0)}}
      if(record.version!==1||record.id!==scope||!record.device)throw new Error('The library key is invalid. Restore an encrypted backup.');const raw=decode64(await this.device.unprotect(record.device));try{if(raw.length!==32)throw new Error('Invalid device key');const key=await aesKey(raw,true);this.keys.set(scope,key);return key}finally{raw.fill(0)}
    })
  }
  async configure(scope:string,options:{pin?:string;biometric:boolean;keepPin?:boolean}){const epoch=this.lockEpoch;return this.serial(async()=>{
    if(scope==='public'||!scope||scope.length>200)throw new Error('Invalid protected scope');if(options.pin)validPin(options.pin)
    if(!options.pin&&!options.biometric&&!options.keepPin)throw new Error('Choose at least one unlock method')
    const caps=await this.device.capabilities();if(!caps.encryption||options.biometric&&!caps.biometric)throw new Error('The selected device protection is unavailable')
    const previous=await this.record(scope);let raw:Uint8Array
    if(previous){if(!this.keys.has(scope))throw new VaultLockedError(scope);raw=new Uint8Array(await crypto.subtle.exportKey('raw',this.keys.get(scope)!))}else raw=crypto.getRandomValues(new Uint8Array(32))
    try{
      const record:ScopeRecord={version:1,id:scope};if(options.keepPin&&!options.pin){if(!previous?.pin)throw new Error('PIN unlock has not been configured');record.pin=previous.pin}
      if(options.pin){const salt=crypto.getRandomValues(new Uint8Array(16));const inner=await seal(await pinKey(options.pin,salt),raw,`scope:${scope}:pin:v1`);record.pin={salt:encode64(salt),envelope:await this.device.protect(JSON.stringify(inner),false)}}
      if(options.biometric)record.biometric=await this.device.protect(encode64(raw),true)
      if(epoch!==this.lockEpoch)throw new VaultLockedError(scope);await this.settings.setSetting(`scope:${scope}`,record);const key=await aesKey(raw,true);if(epoch!==this.lockEpoch)throw new VaultLockedError(scope);this.keys.set(scope,key);this.changed()
    }finally{raw.fill(0)}
  })}
  async unlock(scope:string,method:'pin'|'biometric',pin=''){const epoch=this.lockEpoch;return this.serial(async()=>{
    const record=await this.record(scope);if(!record||record.version!==1||record.id!==scope)throw new Error('This protected area has not been configured')
    if(method==='pin'&&(record.retryAt||0)>Date.now())throw new Error('Too many attempts. Wait before trying again.')
    let raw:Uint8Array
    if(method==='pin'){
      if(!record.pin)throw new Error('PIN unlock is not enabled')
      try{const inner=JSON.parse(await this.device.unprotect(record.pin.envelope)) as SealedBytes;raw=await open(await pinKey(pin,decode64(record.pin.salt)),inner,`scope:${scope}:pin:v1`)}catch{
        const failures=(record.failures||0)+1;await this.settings.setSetting(`scope:${scope}`,{...record,failures,retryAt:failures>=5?Date.now()+Math.min(300000,30000*2**Math.min(4,failures-5)):0});this.changed();throw new Error('The PIN or device key could not unlock this area')
      }
    }else{if(!record.biometric)throw new Error('Device unlock is not enabled');raw=decode64(await this.device.unprotect(record.biometric))}
    try{if(raw.length!==32)throw new Error('Invalid protected key');const key=await aesKey(raw,true);await this.settings.setSetting(`scope:${scope}`,{...record,failures:0,retryAt:0});if(epoch!==this.lockEpoch)throw new VaultLockedError(scope);this.keys.set(scope,key);this.changed()}finally{raw.fill(0)}
  })}
  lock(scope?:string){this.lockEpoch++;if(scope)this.keys.delete(scope);else for(const id of this.keys.keys())if(id!=='public')this.keys.delete(id);this.changed()}
  async exportScope(scope:string,backupKey:CryptoKey){const key=await this.key(scope);const raw=new Uint8Array(await crypto.subtle.exportKey('raw',key));try{return await seal(backupKey,raw,`backup:scope:${scope}:v1`)}finally{raw.fill(0)}}
}

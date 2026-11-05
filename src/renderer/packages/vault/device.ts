import { registerPlugin } from '@capacitor/core'
export type DeviceCapabilities={encryption:boolean;biometric:boolean;name:string}
export interface DeviceProtector {capabilities():Promise<DeviceCapabilities>;protect(value:string,biometric:boolean):Promise<string>;unprotect(value:string):Promise<string>}
interface NativeVault {capabilities():Promise<DeviceCapabilities>;protect(options:{value:string;biometric:boolean}):Promise<{value:string}>;unprotect(options:{value:string}):Promise<{value:string}>}
export function deviceProtector():DeviceProtector {
  if(typeof window!=='undefined'&&window.electronAPI){const ipc=window.electronAPI;return {capabilities:()=>ipc.invoke('vault:key-capabilities'),protect:(value,biometric)=>ipc.invoke('vault:wrap-key',value,biometric),unprotect:value=>ipc.invoke('vault:unwrap-key',value)}}
  const plugin=registerPlugin<NativeVault>('VaultKey')
  return {capabilities:async()=>{try{return await plugin.capabilities()}catch{return {encryption:false,biometric:false,name:'Device key store'}}},protect:async(value,biometric)=>(await plugin.protect({value,biometric})).value,unprotect:async value=>(await plugin.unprotect({value})).value}
}

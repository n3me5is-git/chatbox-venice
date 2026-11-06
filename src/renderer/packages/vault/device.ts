import { registerPlugin } from '@capacitor/core'
import { forkT as ft } from '@/i18n/fork'
export type DeviceCapabilities={encryption:boolean;biometric:boolean;name:string}
export interface DeviceProtector {capabilities():Promise<DeviceCapabilities>;protect(value:string,biometric:boolean):Promise<string>;unprotect(value:string):Promise<string>}
interface NativeVault {capabilities():Promise<DeviceCapabilities>;protect(options:{value:string;biometric:boolean;title:string;subtitle:string;cancel:string}):Promise<{value:string}>;unprotect(options:{value:string;title:string;subtitle:string;cancel:string}):Promise<{value:string}>}
export function deviceProtector():DeviceProtector {
  if(typeof window!=='undefined'&&window.electronAPI){const ipc=window.electronAPI;return {capabilities:()=>ipc.invoke('vault:key-capabilities'),protect:(value,biometric)=>ipc.invoke('vault:wrap-key',value,biometric),unprotect:value=>ipc.invoke('vault:unwrap-key',value)}}
  const plugin=registerPlugin<NativeVault>('VaultKey')
  const labels=()=>({title:ft('Unlock Chatbox Venice'),subtitle:ft('Access protected content'),cancel:ft('Cancel')})
  return {capabilities:async()=>{try{const caps=await plugin.capabilities();return {...caps,name:ft(caps.name)}}catch{return {encryption:false,biometric:false,name:ft('Device key store')}}},protect:async(value,biometric)=>(await plugin.protect({value,biometric,...labels()})).value,unprotect:async value=>(await plugin.unprotect({value,...labels()})).value}
}

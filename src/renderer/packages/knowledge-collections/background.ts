import {registerPlugin} from '@capacitor/core'
import platform from '@/platform'
import {vaultRuntimeFor} from '@/packages/vault/runtime'
import {forkT as ft} from '@/i18n/fork'

export const INDEXING_BACKGROUND='keep-indexing-background'
const native=registerPlugin<{start(options:{title:string;text:string}):Promise<{active:boolean}>;stop():Promise<void>}>('KnowledgeIndexingBackground')
let count=0,foreground=false,error='',chain=Promise.resolve()
const listeners=new Set<()=>void>()
let revision=0
export const indexingBackgroundSnapshot=()=>revision
export const subscribeIndexingBackground=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}}
export const indexingBackgroundStatus=()=>({count,foreground,error})
const changed=()=>{revision++;for(const listener of listeners)listener()}
export function syncIndexingBackground(active=count){
 count=active;changed()
 chain=chain.catch(()=>{}).then(async()=>{const enabled=await vaultRuntimeFor(platform).db.getSetting<boolean>(INDEXING_BACKGROUND)!==false
  if(platform.type==='mobile'){
   if(count&&enabled&&!foreground){try{foreground=(await native.start({title:ft('Knowledge indexing is active'),text:ft('Documents are being indexed. Open the app to view progress or stop indexing.')})).active;error=foreground?'':ft('Background indexing is unavailable. Keep the app open.')}catch{foreground=false;error=ft('Background indexing is unavailable. Keep the app open.')}}
   else if((!count||!enabled)&&foreground){await native.stop().catch(()=>{});foreground=false}
  }else foreground=count>0&&enabled
  changed();if(!count&&document.visibilityState==='hidden')window.dispatchEvent(new Event('chatbox:background-work-ended'))
 });return chain
}
export async function indexingMayPreventLock(){return count>0&&await vaultRuntimeFor(platform).db.getSetting<boolean>(INDEXING_BACKGROUND)!==false&&(platform.type!=='mobile'||foreground)}
if(typeof window!=='undefined')window.addEventListener('chatbox:indexing-background-ended',()=>{foreground=false;changed();if(count&&document.visibilityState==='hidden')void import('@/components/security/AppGate').then(module=>module.lockApplication())})

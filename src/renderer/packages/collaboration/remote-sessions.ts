import type { CollaborationHub,GuestShare } from './hub'
/** Lightweight sidebar projection: importing the session list must not initialize transports or vaults. */
let hub:CollaborationHub|undefined,open:(id:string)=>void=()=>{},version=0
const empty=new Map<string,GuestShare>(),listeners=new Set<()=>void>()
export const remoteSessions={get guests(){return hub?.guests||empty},subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}},getVersion:()=>version,open:(id:string)=>open(id),leave:(id:string)=>hub?.stop(id)}
export function installRemoteSessions(value:CollaborationHub,navigate:(id:string)=>void){hub=value;open=navigate;value.subscribe(()=>{version++;for(const listener of listeners)listener()})}

import type { HitlInput,HitlAnswer } from '@shared/collaboration'
import {forkT as ft} from '@/i18n/fork'
type Router=<T>(sessionId:string,requester:string,input:HitlInput,local:(signal:AbortSignal)=>Promise<T>,encode:(value:T)=>HitlAnswer,decode:(answer:HitlAnswer)=>T,signal?:AbortSignal)=>Promise<T>
let router:Router|undefined,check:(sessionId:string)=>boolean=()=>false
type ShareStatus={active:boolean;participants:number;pending:number}
let status:(id:string)=>ShareStatus=()=>({active:false,participants:0,pending:0})
let turnAllowed:(id:string,actor:string)=>boolean=()=>false
const listeners=new Set<()=>void>()
export function installCollaborationBridge(route:Router,isShared:(sessionId:string)=>boolean,getStatus?:(id:string)=>ShareStatus,authorizeTurn?:(id:string,actor:string)=>boolean){router=route;check=isShared;if(getStatus)status=getStatus;if(authorizeTurn)turnAllowed=authorizeTurn}
export function assertSharedTurn(id:string,actor:string){if(actor!=='owner'&&!turnAllowed(id,actor))throw Error(ft('This shared request is no longer authorized. Send a new message to continue as the owner.'))}
export const sharedChatStatus=(id:string)=>status(id)
export const subscribeSharedChatStatus=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}}
export const notifySharedChatStatus=()=>{for(const listener of listeners)listener()}
export const isSharedChat=(sessionId:string)=>check(sessionId)
export const routeSharedDecision:Router=async(id,requester,input,local,encode,decode,signal)=>{
  const checkLocal = async (localSignal: AbortSignal) => {
    const [{ installedVaultFor }, { default: platform }] = await Promise.all([import('@/packages/vault/runtime'), import('@/platform')])
    if (await installedVaultFor(platform)?.projects?.isApplicationLocked()) throw Error(ft('Unlock Chatbox to respond to this request'))
    localSignal.throwIfAborted()
    return local(localSignal)
  }
  return router ? router(id,requester,input,checkLocal,encode,decode,signal) : requester!=='owner' ? decode(null) : checkLocal(signal||new AbortController().signal)
}

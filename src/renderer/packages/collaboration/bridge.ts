import type { HitlInput,HitlAnswer } from '@shared/collaboration'
type Router=<T>(sessionId:string,requester:string,input:HitlInput,local:(signal:AbortSignal)=>Promise<T>,encode:(value:T)=>HitlAnswer,decode:(answer:HitlAnswer)=>T,signal?:AbortSignal)=>Promise<T>
let router:Router|undefined,check:(sessionId:string)=>boolean=()=>false
type ShareStatus={active:boolean;participants:number;pending:number}
let status:(id:string)=>ShareStatus=()=>({active:false,participants:0,pending:0})
const listeners=new Set<()=>void>()
export function installCollaborationBridge(route:Router,isShared:(sessionId:string)=>boolean,getStatus?:(id:string)=>ShareStatus){router=route;check=isShared;if(getStatus)status=getStatus}
export const sharedChatStatus=(id:string)=>status(id)
export const subscribeSharedChatStatus=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}}
export const notifySharedChatStatus=()=>{for(const listener of listeners)listener()}
export const isSharedChat=(sessionId:string)=>check(sessionId)
export const routeSharedDecision:Router=(id,requester,input,local,encode,decode,signal)=>router?router(id,requester,input,local,encode,decode,signal):local(signal||new AbortController().signal)

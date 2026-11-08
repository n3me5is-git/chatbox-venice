import type { HitlInput,HitlAnswer } from '@shared/collaboration'
type Router=<T>(sessionId:string,requester:string,input:HitlInput,local:(signal:AbortSignal)=>Promise<T>,encode:(value:T)=>HitlAnswer,decode:(answer:HitlAnswer)=>T,signal?:AbortSignal)=>Promise<T>
let router:Router|undefined,check:(sessionId:string)=>boolean=()=>false
export function installCollaborationBridge(route:Router,isShared:(sessionId:string)=>boolean){router=route;check=isShared}
export const isSharedChat=(sessionId:string)=>check(sessionId)
export const routeSharedDecision:Router=(id,requester,input,local,encode,decode,signal)=>router?router(id,requester,input,local,encode,decode,signal):local(signal||new AbortController().signal)

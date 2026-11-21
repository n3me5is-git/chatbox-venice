export type ReviewActivity={phase:'checking'|'correcting'|'retrieving';reasoning:string;updated:number}
const active=new Map<string,ReviewActivity>(),listeners=new Set<()=>void>();let revision=0,timer:ReturnType<typeof setTimeout>|undefined
function emit(){revision++;if(!timer)timer=setTimeout(()=>{timer=undefined;for(const listener of listeners)listener()},120)}
export const reviewActivity={snapshot:()=>revision,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}},get:(id:string)=>active.get(id),set:(id:string,phase:ReviewActivity['phase'],reasoning='')=>{active.set(id,{phase,reasoning:reasoning.slice(-16000),updated:Date.now()});emit()},clear:(id:string)=>{active.delete(id);emit()}}

/** A productive stream may continue past the idle deadline, with a separate hard cap. */
export function knowledgeRequestDeadline(parent:AbortSignal,idleMs=60000,totalMs=180000){
 const controller=new AbortController(),started=Date.now();let timer:ReturnType<typeof setTimeout>
 const arm=()=>{clearTimeout(timer);const remaining=totalMs-(Date.now()-started);timer=setTimeout(()=>controller.abort(new Error('Knowledge model request timed out')),Math.max(0,Math.min(idleMs,remaining)))}
 const abort=()=>controller.abort(parent.reason)
 parent.addEventListener('abort',abort,{once:true});if(parent.aborted)abort();else arm()
 return {signal:controller.signal,activity:()=>{if(!controller.signal.aborted)arm()},dispose:()=>{clearTimeout(timer);parent.removeEventListener('abort',abort)}}
}

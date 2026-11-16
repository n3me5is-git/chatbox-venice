/** Keep each screen in a disposable tab. Closing a tab releases its workers,
 * IndexedDB handles and JS context instead of retaining a long navigation history. */
export function auditPages(rootCdp,{exceptions,requests}){
 let previous,socket
 const close=async()=>{socket?.close();socket=undefined;if(previous){await rootCdp('Target.closeTarget',{targetId:previous});previous=undefined}}
 return {close,open:async()=>{
  await close();const {targetId}=await rootCdp('Target.createTarget',{url:'about:blank'});previous=targetId
  const pages=await(await fetch('http://127.0.0.1:9222/json/list')).json(),target=pages.find(page=>page.id===targetId);if(!target)throw Error('Audit tab debugger unavailable')
  const current=new WebSocket(target.webSocketDebuggerUrl);socket=current;await new Promise((resolve,reject)=>{current.onopen=resolve;current.onerror=reject})
  let serial=0;const pending=new Map()
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Audit CDP timeout: '+method))},20000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});current.send(JSON.stringify({id,method,params}))})
  current.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const task=pending.get(message.id);if(task){pending.delete(message.id);message.error?task.reject(Error(message.error.message)):task.resolve(message.result)}}if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);if(message.method==='Network.requestWillBeSent')requests.push(message.params.request.url);if(message.method==='Inspector.targetCrashed')exceptions.push('Audit renderer crashed');if(message.method==='Page.javascriptDialogOpening'){exceptions.push('Unexpected audit dialog: '+message.params.message);void cdp('Page.handleJavaScriptDialog',{accept:false})}}
  const evaluate=async expression=>{const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value}
  const click=async expression=>{let box,previous;const end=Date.now()+5000;while(Date.now()<end){const value=await evaluate(`(async()=>{const e=${expression};if(!e||e.disabled)return null;e.scrollIntoView({block:'center',behavior:'instant'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);if(!r.width||!r.height||y<0||y>=innerHeight||!(hit===e||e.contains(hit)))return null;return{x,y}})()`);if(value&&previous&&Math.abs(value.x-previous.x)<.5&&Math.abs(value.y-previous.y)<.5){box=value;break}previous=value;await new Promise(resolve=>setTimeout(resolve,50))}if(!box)throw Error('Audit control missing, disabled or obscured: '+expression);await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[box]});await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
  await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Network.enable');await cdp('Emulation.setTouchEmulationEnabled',{enabled:true})
  return {cdp,evaluate,click}
 }}
}

const clean=(text:string)=>text.replace(/(?:VENICE_INFERENCE_KEY_|Bearer\s+)[A-Za-z0-9_.-]+/gi,'[redacted]').trim().slice(0,8000)
function detail(value:unknown):string{
 if(typeof value==='string')return value
 if(Array.isArray(value))return value.slice(0,12).map(detail).filter(Boolean).join('\n')
 if(value&&typeof value==='object'){const item=value as Record<string,unknown>,reason=detail(item.message)||detail(item.msg)||detail(item.detail)||detail(item.error)||detail(item.errors);const path=Array.isArray(item.loc)?item.loc.filter(part=>part!=='body').join('.'):'';return path&&reason?path+': '+reason:reason}
 return ''
}
export function failureReason(error:string){
 const value=error.replace(/^Venice [^\n]+?failed \(HTTP \d+\):\s*/,'').replace(/\.? No paid request was retried\.?$/,'').trim()
 try{return clean(detail(JSON.parse(value))||value)}catch{return clean(value)}
}
/** Bound error bodies too: do not discard the useful validation message on HTTP 400/422. */
export async function responseFailureReason(response:Response){
 let text='';const reader=response.body?.getReader(),decoder=new TextDecoder()
 try{if(reader){let size=0;while(size<32768){const part=await reader.read();if(part.done)break;const bytes=part.value.subarray(0,32768-size);text+=decoder.decode(bytes,{stream:true});size+=bytes.length}text+=decoder.decode()}else text=(await response.text()).slice(0,32768)}finally{if(reader){await reader.cancel().catch(()=>{});reader.releaseLock()}}
 if(/^\s*</.test(text))return 'The provider returned an unreadable error response.'
 return failureReason(text)||'The provider did not supply an error reason.'
}

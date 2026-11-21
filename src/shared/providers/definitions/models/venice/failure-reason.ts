const clean=(text:string)=>text.replace(/(?:VENICE_INFERENCE_KEY_|Bearer\s+)[A-Za-z0-9_.-]+/gi,'[redacted]').trim().slice(0,8000)
function fieldErrors(value: unknown, path: string[] = []): string[] {
 if(!value || typeof value!=='object' || Array.isArray(value) || path.length > 5)return []
 const entries=Object.entries(value as Record<string,unknown>).slice(0,20)
 const own=entries.find(([key])=>key==='_errors')?.[1]
 const errors=Array.isArray(own)?own.filter((error):error is string=>typeof error==='string').slice(0,6).map(error=>path.length?path.join('.')+': '+error:error):[]
 for(const [key,entry] of entries){if(key==='_errors'||!/^[-\w]+$/.test(key))continue;for(const error of fieldErrors(entry,[...path,key])){errors.push(error);if(errors.length>=12)return errors}}
 return errors
}
function detail(value:unknown):string{
 if(typeof value==='string')return value
 if(Array.isArray(value))return value.slice(0,12).map(detail).filter(Boolean).join('\n')
 if(value&&typeof value==='object'){const item=value as Record<string,unknown>,reason=detail(item.message)||detail(item.msg)||detail(item.detail)||detail(item.error)||detail(item.errors);const path=Array.isArray(item.loc)?item.loc.filter(part=>part!=='body').join('.'):'';return [path&&reason?path+': '+reason:reason,...fieldErrors(item.details)].filter(Boolean).join('\n')}
 return ''
}
export function failureReason(error:string){
 const value=error.replace(/^(?:API Error:\s*)?Venice [^\n]+?failed \(HTTP \d+\):\s*/,'').replace(/\.? No paid request was retried\.?$/,'').trim()
 try{return clean(detail(JSON.parse(value))||value)}catch{return clean(value)}
}
/** Bound error bodies too: do not discard the useful validation message on HTTP 400/422. */
export async function responseFailureReason(response:Response){
 let text='';const reader=response.body?.getReader(),decoder=new TextDecoder()
 try{if(reader){let size=0;while(size<32768){const part=await reader.read();if(part.done)break;const bytes=part.value.subarray(0,32768-size);text+=decoder.decode(bytes,{stream:true});size+=bytes.length}text+=decoder.decode()}else text=(await response.text()).slice(0,32768)}finally{if(reader){await reader.cancel().catch(()=>{});reader.releaseLock()}}
 try{const parsed=JSON.parse(text);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))return clean(detail(parsed))||'The provider did not supply an error reason.'}catch{/* Unstructured bodies can echo request data, credentials or proxy HTML. Do not persist them. */}
 return 'The provider returned an unreadable error response.'
}

/** Repair legacy native-search bookkeeping without touching client function/MCP call pairs. */
export function normalizeSubscriptionSearchReplay(input:unknown):unknown{
  if(!Array.isArray(input))return input
  const functionIds=new Set(input.filter(item=>item?.type==='function_call').map(item=>item.call_id)),nativeIds=new Set(input.filter(item=>item?.type==='web_search_call').map(item=>item.id))
  return input.flatMap(item=>{
    if(item?.type!=='function_call_output'||typeof item.call_id!=='string'||!/^ws_[a-zA-Z0-9]+$/.test(item.call_id)||functionIds.has(item.call_id))return [item]
    if(nativeIds.has(item.call_id))return []
    let result:unknown
    try{result=typeof item.output==='string'?JSON.parse(item.output):item.output}catch{return []}
    const action=result&&typeof result==='object'?'action'in result?(result as {action:unknown}).action:undefined:undefined
    if(!action||typeof action!=='object'||!('type'in action))return []
    const value=action as Record<string,unknown>
    let replay:Record<string,unknown>|undefined
    if(value.type==='search')replay={type:'search',...(typeof value.query==='string'?{query:value.query}:{}),...(Array.isArray(value.queries)?{queries:value.queries.filter(item=>typeof item==='string')}: {})}
    if((value.type==='openPage'||value.type==='open_page')&&typeof value.url==='string')replay={type:'open_page',url:value.url}
    if((value.type==='findInPage'||value.type==='find_in_page')&&typeof value.url==='string'&&typeof value.pattern==='string')replay={type:'find_in_page',url:value.url,pattern:value.pattern}
    if(!replay)return []
    nativeIds.add(item.call_id);return [{type:'web_search_call',id:item.call_id,status:'completed',action:replay}]
  })
}

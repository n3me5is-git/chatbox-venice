import { expect,it } from 'vitest'
import { normalizeSubscriptionSearchReplay } from './chatgpt-search-replay'
it('reconstructs legacy native search output and leaves real function/MCP pairs unchanged',()=>{
  const pair=[{type:'function_call',call_id:'call_mcp',name:'web_search',arguments:'{}'},{type:'function_call_output',call_id:'call_mcp',output:'{"results":[]}'},{type:'function_call',call_id:'ws_client',name:'custom_tool',arguments:'{}'},{type:'function_call_output',call_id:'ws_client',output:'ok'}]
  expect(normalizeSubscriptionSearchReplay([...pair,{type:'function_call_output',call_id:'ws_abc123',output:JSON.stringify({action:{type:'search',queries:['test']}})}])).toEqual([...pair,{type:'web_search_call',id:'ws_abc123',status:'completed',action:{type:'search',queries:['test']}}])
})
it('does not replay orphan native bookkeeping with a missing result, and keeps existing native calls and other outputs',()=>{
  const native={type:'web_search_call',id:'ws_a',status:'completed',action:{type:'search',query:'test'}},other={type:'function_call_output',call_id:'call_unknown',output:'do not alter'}
  expect(normalizeSubscriptionSearchReplay([native,{type:'function_call_output',call_id:'ws_a',output:'{}'},{type:'function_call_output',call_id:'ws_b',output:'null'},other])).toEqual([native,other])
})

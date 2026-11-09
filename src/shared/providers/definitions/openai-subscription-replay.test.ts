import { expect,it,vi } from 'vitest'
import { jsonSchema } from 'ai'
import { createDefaultSettings } from '@chatbox/core/domain/settings'
import { openaiSubscriptionProvider } from './openai-subscription'
import { convertToModelMessages } from '../../services/model-message-converter'
import { createMessage,type Config } from '../../types'
import type { ModelDependencies } from '../../types/adapters'

function response(search:boolean){
  const message={type:'message',id:'msg_test',role:'assistant',status:'completed',content:[{type:'output_text',text:'A sourced answer',annotations:[]}]},native={type:'web_search_call',id:'ws_05b0356395789635016af1f40c344c87d2916dc67db1754339',status:'completed',action:{type:'search',query:'test query'}}
  const complete={id:'resp_test',object:'response',created_at:1700000000,model:'gpt-6-astra',status:'completed',output:search?[native,message]:[message],usage:{input_tokens:10,output_tokens:4,total_tokens:14,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}}
  const offset=search?1:0,events=[{type:'response.created',response:{...complete,status:'in_progress',output:[]}},...(search?[{type:'response.output_item.added',output_index:0,item:{...native,status:'in_progress'}},{type:'response.output_item.done',output_index:0,item:native}]:[]),{type:'response.output_item.added',output_index:offset,item:{...message,status:'in_progress',content:[]}},{type:'response.content_part.added',item_id:message.id,output_index:offset,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',item_id:message.id,output_index:offset,content_index:0,delta:'A sourced answer'},{type:'response.output_item.done',output_index:offset,item:message},{type:'response.completed',response:complete}]
  return new Response(events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}})
}
it('uses the production SDK to replay native search after persistence alongside a real client tool, including after search is turned off',async()=>{
  const requests:any[]=[],api=vi.fn(async(options:any)=>{requests.push(JSON.parse(options.body));return response(requests.length===1)})
  const dependencies={request:{apiRequest:api},subscription:{getCredential:async()=>({accessToken:'synthetic-test-token'})},sentry:{captureException:vi.fn()},storage:{getImage:async()=>null}} as unknown as ModelDependencies
  const make=(enabled:boolean)=>openaiSubscriptionProvider.createModel({settings:{subscriptionWebSearch:enabled},globalSettings:createDefaultSettings(),config:{} as Config,dependencies,providerSetting:{},formattedApiHost:'',formattedApiPath:'',model:{modelId:'gpt-6-astra',capabilities:['tool_use']},effectiveApiKey:'vault'})
  const model=make(true),tools={web_search:{description:'Separate Chatbox search',inputSchema:jsonSchema({type:'object',properties:{}})},mcp_lookup:{inputSchema:jsonSchema({type:'object',properties:{}})}}
  const first=await model.chat([{role:'user',content:'Search the web'}],{tools})
  const search=first.contentParts.find(part=>part.type==='tool-call')
  expect(search).toMatchObject({type:'tool-call',toolName:'chatgpt_native_search',providerExecuted:true,state:'result',result:{action:{type:'search',query:'test query'}}})
  const assistant=createMessage('assistant','');assistant.contentParts=first.contentParts;assistant.contentParts.push({type:'tool-call',toolCallId:'call_mcp',toolName:'mcp_lookup',state:'result',args:{},result:{record:'synthetic'}})
  const messages=await convertToModelMessages([createMessage('user','Search the web'),JSON.parse(JSON.stringify(assistant)),createMessage('user','Continue')],async()=>null)
  await model.chat(messages,{tools});await make(false).chat(messages,{tools})
  for(const body of requests.slice(1)){
    expect(body.input.some((item:any)=>item.type==='function_call_output'&&item.call_id.startsWith('ws_'))).toBe(false)
    expect(body.input).toEqual(expect.arrayContaining([expect.objectContaining({type:'web_search_call',id:search?.type==='tool-call'?search.toolCallId:''}),expect.objectContaining({type:'function_call',call_id:'call_mcp'}),expect.objectContaining({type:'function_call_output',call_id:'call_mcp'})]))
  }
  expect(requests[0].tools).toEqual(expect.arrayContaining([expect.objectContaining({type:'web_search'}),expect.objectContaining({type:'function',name:'web_search'})]))
  expect(requests[2].tools.some((tool:any)=>tool.type==='web_search')).toBe(false)
})

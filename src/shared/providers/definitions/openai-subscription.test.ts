import { expect, it, vi } from 'vitest'
import type { ModelDependencies } from '../../types/adapters'
import { ChatGPTSubscriptionModel, openaiSubscriptionProvider } from './openai-subscription'
import { createSubscriptionFetch } from '../../oauth/chatgpt-subscription'
import { jsonSchema } from 'ai'
import { ModelProviderEnum, type Config } from '../../types'
import { createDefaultSettings } from '@chatbox/core/domain/settings'
import { subscriptionDefaultModels } from '../../oauth/chatgpt-model-catalog'
const item = { type: 'image_generation_call', status: 'completed', result: 'iVBORw0KGgo=' }
const stream = () => new Response('data: ' + JSON.stringify({ type: 'response.completed', response: { output: [item] } }) + '\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
const deps = (request: any): ModelDependencies => ({request:{apiRequest:request,fetchWithOptions:vi.fn()},storage:{saveImage:vi.fn(),getImage:vi.fn()},sentry:{captureException:vi.fn(),withScope:vi.fn()},getRemoteConfig:vi.fn(),subscription:{getCredential:async()=>({accessToken:'synthetic-secret'})}})
function imageModel(id: string, request: any, route: 'image-tool' | 'images' = 'image-tool') {
  return new ChatGPTSubscriptionModel({ apiKey:'vault',apiHost:'https://api.openai.com/v1',apiPath:'/responses',model:{modelId:id,type:'image',subscriptionEndpoint:route} },deps(request))
}
it('uses a virtual image model without inventing the server renderer version', async () => {
  const request=vi.fn(async(_options: any)=>stream()), model=imageModel('chatgpt-image-auto',request)
  expect(await model.paint({prompt:'a test icon',num:1})).toHaveLength(1)
  const body=JSON.parse(request.mock.calls[0][0].body)
  expect(body.model).toBe('gpt-6-luna'); expect(body.tools[0].model).toBeUndefined(); expect(request.mock.calls[0][0].url).toBe('https://chatgpt.com/backend-api/codex/responses')
})
it('keeps a manually entered image ID on its selected tool route', async () => {
  const request=vi.fn(async(_options: any)=>stream()), model=imageModel('gpt-image-2.6-sunburst',request); model.imageDriverModel='gpt-6.1-sol'
  await model.paint({prompt:'a test icon',num:1})
  const body=JSON.parse(request.mock.calls[0][0].body); expect(body.model).toBe('gpt-6.1-sol');expect(body.tools[0].model).toBe('gpt-image-2.6-sunburst')
})
it('routes custom native image generation and editing to fixed Codex endpoints', async () => {
  const request=vi.fn(async(_options: any)=>new Response(JSON.stringify({data:[{b64_json:'iVBORw0KGgo='}]}),{headers:{'content-type':'application/json'}})), model=imageModel('custom-image-model',request,'images')
  await model.paint({prompt:'a test icon',num:1}); await model.paint({prompt:'edit icon',num:1,images:[{imageUrl:'data:image/png;base64,aA=='}]})
  expect(request.mock.calls.map(call=>call[0].url)).toEqual(['https://chatgpt.com/backend-api/codex/images/generations','https://chatgpt.com/backend-api/codex/images/edits'])
  expect(JSON.parse(request.mock.calls[1][0].body)).toMatchObject({model:'custom-image-model',images:[{image_url:'data:image/png;base64,aA=='}]})
})
it('keeps native search and MCP/global search tools together, and honors native off', async () => {
  const request=vi.fn(async(_options: any)=>stream()), dependencies=deps(request)
  const body={model:'gpt-6-astra',tools:[{type:'function',name:'web_search',parameters:{}},{type:'function',name:'mcp_local',parameters:{}}]}
  await createSubscriptionFetch(dependencies,{webSearch:true})('',{body:JSON.stringify(body)})
  expect(JSON.parse(request.mock.calls[0][0].body).tools.map((t:any)=>t.type==='function'?t.name:t.type)).toEqual(['web_search','mcp_local','web_search'])
  await createSubscriptionFetch(dependencies,{webSearch:false})('',{body:JSON.stringify({...body,tools:[...body.tools,{type:'web_search'}]})})
  expect(JSON.parse(request.mock.calls[1][0].body).tools).toHaveLength(2)
})
it('never silently retries a denied image request on another model or billing endpoint', async () => {
  const request=vi.fn(async(_options: any)=>new Response(JSON.stringify({error:{message:'Account image limit'}}),{status:429})), model=imageModel('chatgpt-image-auto',request)
  await expect(model.paint({prompt:'test',num:1})).rejects.toThrow('Account image limit'); expect(request).toHaveBeenCalledOnce()
})

function textStream(model: string) {
  const annotation = {type:'url_citation',url:'https://example.org/source',title:'Search source',start_index:0,end_index:6}
  const message = {type:'message',id:'msg_test',role:'assistant',status:'completed',content:[{type:'output_text',text:'Answer',annotations:[annotation]}]}
  const response = {id:'resp_test',object:'response',created_at:1700000000,model,status:'completed',output:[message],usage:{input_tokens:10,output_tokens:2,total_tokens:12,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}}
  return new Response([
    {type:'response.created',response:{...response,status:'in_progress',output:[]}},
    {type:'response.output_item.added',output_index:0,item:{...message,status:'in_progress',content:[]}},
    {type:'response.content_part.added',item_id:'msg_test',output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},
    {type:'response.output_text.delta',item_id:'msg_test',output_index:0,content_index:0,delta:'Answer'},
    {type:'response.output_text.annotation.added',item_id:'msg_test',output_index:0,content_index:0,annotation_index:0,annotation},
    {type:'response.output_text.done',item_id:'msg_test',output_index:0,content_index:0,text:'Answer'},
    {type:'response.output_item.done',output_index:0,item:message},
    {type:'response.completed',response},
  ].map(event=>'data: '+JSON.stringify(event)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}})
}
it.each([['gpt-6-astra','max'],['gpt-6.1-sol','xhigh'],['custom-future-model','max']] as const)('streams %s through the production SDK with %s thinking, native search, MCP tools and clickable sources', async (id, effort) => {
  const modelInfo = {...(subscriptionDefaultModels().find(m=>m.modelId===id) || {modelId:id,type:'chat' as const,capabilities:['reasoning' as const,'tool_use' as const]}),providerId:ModelProviderEnum.OpenAISubscription,extraBody:{metadata:{local_test:'synthetic'}}}
  const request=vi.fn(async(_options:any)=>textStream(id))
  const model=openaiSubscriptionProvider.createModel({settings:{subscriptionWebSearch:true},globalSettings:createDefaultSettings(),config:{} as Config,dependencies:deps(request),providerSetting:{},formattedApiHost:'',formattedApiPath:'',model:modelInfo,effectiveApiKey:'vault'})
  const parts=[]
  for await(const part of model.chatStream([{role:'user',content:'Find the documentation'}],{providerOptions:{openai:{reasoningEffort:effort,forceReasoning:true}},tools:{mcp_lookup:{description:'Read local synthetic records',inputSchema:jsonSchema({type:'object',properties:{}})}}})) parts.push(part)
  expect(parts.filter(part=>part.type==='error')).toEqual([])
  const body=JSON.parse(request.mock.calls[0][0].body)
  expect(body).toMatchObject({model:id,reasoning:{effort},store:false,stream:true,metadata:{local_test:'synthetic'}})
  expect(body.tools).toEqual(expect.arrayContaining([expect.objectContaining({type:'function',name:'mcp_lookup'}),{type:'web_search'}]))
  expect(parts.filter(part=>part.type==='text-delta').map(part=>part.text).join('')).toContain('[1. Search source](https://example.org/source)')
  expect(parts.at(-1)?.type).toBe('finish')
})

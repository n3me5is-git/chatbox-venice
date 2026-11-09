import { expect, it, vi } from 'vitest'
import type { ModelDependencies } from '../../types/adapters'
import { ChatGPTSubscriptionModel } from './openai-subscription'
import { createSubscriptionFetch } from '../../oauth/chatgpt-subscription'
const item = { type: 'image_generation_call', status: 'completed', result: 'iVBORw0KGgo=' }
const stream = () => new Response('data: ' + JSON.stringify({ type: 'response.completed', response: { output: [item] } }) + '\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
const deps = (request: any): ModelDependencies => ({request:{apiRequest:request,fetchWithOptions:vi.fn()},storage:{saveImage:vi.fn(),getImage:vi.fn()},sentry:{captureException:vi.fn(),withScope:vi.fn()},getRemoteConfig:vi.fn(),subscription:{getCredential:async()=>({accessToken:'synthetic-secret'})}})
function imageModel(id: string, request: any, route: 'image-tool' | 'images' = 'image-tool') {
  return new ChatGPTSubscriptionModel({ apiKey:'vault',apiHost:'https://api.openai.com/v1',apiPath:'/responses',model:{modelId:id,type:'image',subscriptionEndpoint:route} },deps(request))
}
it('uses a virtual image model without inventing the server renderer version', async () => {
  const request=vi.fn(async()=>stream()), model=imageModel('chatgpt-image-auto',request)
  expect(await model.paint({prompt:'a test icon',num:1})).toHaveLength(1)
  const body=JSON.parse(request.mock.calls[0][0].body)
  expect(body.model).toBe('gpt-6-luna'); expect(body.tools[0].model).toBeUndefined(); expect(request.mock.calls[0][0].url).toBe('https://chatgpt.com/backend-api/codex/responses')
})
it('keeps a manually entered image ID on its selected tool route', async () => {
  const request=vi.fn(async()=>stream()), model=imageModel('gpt-image-2.6-sunburst',request); model.imageDriverModel='gpt-6.1-sol'
  await model.paint({prompt:'a test icon',num:1})
  const body=JSON.parse(request.mock.calls[0][0].body); expect(body.model).toBe('gpt-6.1-sol');expect(body.tools[0].model).toBe('gpt-image-2.6-sunburst')
})
it('routes custom native image generation and editing to fixed Codex endpoints', async () => {
  const request=vi.fn(async()=>new Response(JSON.stringify({data:[{b64_json:'iVBORw0KGgo='}]}),{headers:{'content-type':'application/json'}})), model=imageModel('custom-image-model',request,'images')
  await model.paint({prompt:'a test icon',num:1}); await model.paint({prompt:'edit icon',num:1,images:[{imageUrl:'data:image/png;base64,aA=='}]})
  expect(request.mock.calls.map(call=>call[0].url)).toEqual(['https://chatgpt.com/backend-api/codex/images/generations','https://chatgpt.com/backend-api/codex/images/edits'])
  expect(JSON.parse(request.mock.calls[1][0].body)).toMatchObject({model:'custom-image-model',images:[{image_url:'data:image/png;base64,aA=='}]})
})
it('keeps native search and MCP/global search tools together, and honors native off', async () => {
  const request=vi.fn(async()=>stream()), dependencies=deps(request)
  const body={model:'gpt-6-astra',tools:[{type:'function',name:'web_search',parameters:{}},{type:'function',name:'mcp_local',parameters:{}}]}
  await createSubscriptionFetch(dependencies,{webSearch:true})('',{body:JSON.stringify(body)})
  expect(JSON.parse(request.mock.calls[0][0].body).tools.map((t:any)=>t.type==='function'?t.name:t.type)).toEqual(['web_search','mcp_local','web_search'])
  await createSubscriptionFetch(dependencies,{webSearch:false})('',{body:JSON.stringify({...body,tools:[...body.tools,{type:'web_search'}]})})
  expect(JSON.parse(request.mock.calls[1][0].body).tools).toHaveLength(2)
})
it('never silently retries a denied image request on another model or billing endpoint', async () => {
  const request=vi.fn(async()=>new Response(JSON.stringify({error:{message:'Account image limit'}}),{status:429})), model=imageModel('chatgpt-image-auto',request)
  await expect(model.paint({prompt:'test',num:1})).rejects.toThrow('Account image limit'); expect(request).toHaveBeenCalledOnce()
})

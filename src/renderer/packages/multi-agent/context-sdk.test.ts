import { expect,it,vi } from 'vitest'
import { jsonSchema, type ModelMessage } from 'ai'
import { createDefaultSettings } from '@chatbox/core/domain/settings'
import { getCompactionBudget } from '@chatbox/core/application/token-estimation/math'
import { ModelProviderEnum, type Config } from '@shared/types'
import type { ModelDependencies } from '@shared/types/adapters'
import { openaiSubscriptionProvider } from '@shared/providers/definitions/openai-subscription'
import { WorkerContextController } from './context'

function eventStream(step:number) {
  const id='item_'+step,callId='call_'+step,argumentsJSON='{"query":"source '+step+'"}'
  const item=step<2?{id,type:'function_call',call_id:callId,name:'lookup',arguments:argumentsJSON,status:'completed'}:{id,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Finished',annotations:[]}]}
  const response={id:'response_'+step,object:'response',created_at:1700000000,model:'gpt-6.1-sol',status:'completed',output:[item],usage:{input_tokens:10,output_tokens:2,total_tokens:12,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}}
  const events:any[]=[{type:'response.created',response:{...response,status:'in_progress',output:[]}},{type:'response.output_item.added',output_index:0,item:step<2?{...item,arguments:'',status:'in_progress'}:{...item,content:[],status:'in_progress'}}]
  if(step<2) events.push({type:'response.function_call_arguments.delta',item_id:id,output_index:0,delta:argumentsJSON},{type:'response.function_call_arguments.done',item_id:id,output_index:0,arguments:argumentsJSON})
  else events.push({type:'response.content_part.added',item_id:id,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',item_id:id,output_index:0,content_index:0,delta:'Finished'},{type:'response.output_text.done',item_id:id,output_index:0,content_index:0,text:'Finished'})
  events.push({type:'response.output_item.done',output_index:0,item},{type:'response.completed',response})
  return new Response(events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}})
}
it('keeps worker compaction valid across real SDK function-call steps and never resurrects the discarded prefix',async()=>{
  let step=0
  const request=vi.fn(async(_options:any)=>eventStream(step++)),summarize=vi.fn(async()=> 'The original objective and earlier lookup outcomes are preserved.')
  const dependencies={request:{apiRequest:request,fetchWithOptions:vi.fn()},storage:{saveImage:vi.fn(),getImage:vi.fn()},sentry:{captureException:vi.fn(),withScope:vi.fn()},getRemoteConfig:vi.fn(),subscription:{getCredential:async()=>({accessToken:'synthetic-token'})}} as ModelDependencies
  const model=openaiSubscriptionProvider.createModel({settings:{},globalSettings:createDefaultSettings(),config:{} as Config,dependencies,providerSetting:{},formattedApiHost:'',formattedApiPath:'',model:{modelId:'gpt-6.1-sol',providerId:ModelProviderEnum.OpenAISubscription,type:'chat',capabilities:['tool_use']},effectiveApiKey:'vault'})
  const signal=new AbortController().signal
  const context=new WorkerContextController({budget:getCompactionBudget(4000,{maxOutputTokens:1000}),automatic:true,signal,toolTokens:100,countMessage:message=>JSON.stringify(message).length,summarize})
  const messages:ModelMessage[]=[{role:'system',content:'Worker policy'},{role:'user',content:'old-private-source '.repeat(50)},{role:'assistant',content:[{type:'tool-call',toolCallId:'old',toolName:'lookup',input:{}}]},{role:'tool',content:[{type:'tool-result',toolCallId:'old',toolName:'lookup',output:{type:'text',value:'x'.repeat(1800)}}]},{role:'user',content:'Look up two sources and finish.'}]
  const execute=vi.fn(async()=> 'x'.repeat(1800))
  const result=await model.chat(messages,{signal,maxSteps:4,tools:{lookup:{inputSchema:jsonSchema({type:'object',properties:{query:{type:'string'}}}),execute}},prepareStep:async state=>({messages:await context.prepare([...state.initialMessages,...state.responseMessages])})})
  expect(result.contentParts.filter(part=>part.type==='text').map(part=>part.text).join('')).toContain('Finished')
  expect(execute).toHaveBeenCalledTimes(2);expect(request).toHaveBeenCalledTimes(3);expect(summarize.mock.calls.length).toBeGreaterThanOrEqual(2)
  for(const [options] of request.mock.calls) expect(options.body).not.toContain('old-private-source')
})

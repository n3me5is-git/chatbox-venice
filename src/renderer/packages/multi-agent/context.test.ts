import { expect, it, vi } from 'vitest'
import type { ModelMessage } from 'ai'
import type { ModelInterface } from '@shared/models/types'
import { getCompactionBudget } from '@chatbox/core/application/token-estimation/math'
import { WorkerContextController, summarizeWorkerMessages } from './context'
import { workerSessionParameters } from './parameters'

const budget=getCompactionBudget(4000,{maxOutputTokens:1000})!
const call=(id:string):ModelMessage=>({role:'assistant',content:[{type:'tool-call',toolCallId:id,toolName:'lookup',input:{}}]})
const result=(id:string,length:number):ModelMessage=>({role:'tool',content:[{type:'tool-result',toolCallId:id,toolName:'lookup',output:{type:'text',value:'x'.repeat(length)}}]})
const count=(message:ModelMessage)=>JSON.stringify(message).length
it('compacts the complete worker request, preserves tool rounds and reuses/advances its summary across steps',async()=>{
  const summarize=vi.fn(async()=> 'A concise summary of the previous task and results')
  const context=new WorkerContextController({budget,automatic:true,signal:new AbortController().signal,toolTokens:100,countMessage:count,summarize})
  const source:ModelMessage[]=[{role:'system',content:'Keep the worker policy'}, {role:'user',content:'old-private-task '.repeat(50)},call('first'),result('first',1800),call('second'),result('second',300)]
  const initial=await context.prepare(source)
  expect(JSON.stringify(initial)).not.toContain('old-private-task');expect(initial[0]).toEqual(source[0]);expect(initial.at(-1)).toBe(source.at(-1))
  expect(summarize).toHaveBeenCalledOnce();expect(await context.prepare(source)).toEqual(initial);expect(summarize).toHaveBeenCalledOnce()
  const next=await context.prepare([...source,call('third'),result('third',1800)])
  expect(summarize).toHaveBeenCalledTimes(2);expect(JSON.stringify(next)).not.toContain('old-private-task');expect(JSON.stringify(next)).not.toContain('"first"');expect(next.at(-2)).toMatchObject({role:'assistant',content:[{toolCallId:'third'}]})
})
it('accounts for fixed tools and blocks requests that cannot fit, without tool execution or silent truncation',async()=>{
  const summarize=vi.fn(), context=new WorkerContextController({budget,automatic:false,signal:new AbortController().signal,toolTokens:2900,countMessage:count,summarize})
  await expect(context.prepare([{role:'user',content:'a'.repeat(200)}])).rejects.toThrow('exceeds the context budget');expect(summarize).not.toHaveBeenCalled()
})
it('can compact a later tool round after an earlier summary did not reduce the request',async()=>{
  const summarize=vi.fn().mockResolvedValueOnce('Short summary').mockResolvedValueOnce('x'.repeat(2600)).mockResolvedValue('Short summary')
  const context=new WorkerContextController({budget,automatic:true,signal:new AbortController().signal,toolTokens:100,countMessage:count,summarize})
  const initial:ModelMessage[]=[{role:'system',content:'Policy'},{role:'user',content:'old '.repeat(200)},call('old'),result('old',1800),{role:'user',content:'Continue working'}]
  await context.prepare(initial)
  const first=[...initial,call('one'),result('one',2100)]
  await expect(context.prepare(first)).resolves.toBeDefined()
  const final=await context.prepare([...first,call('two'),result('two',1800)])
  expect(summarize).toHaveBeenCalledTimes(3);expect(JSON.stringify(final)).not.toContain('"one"');expect(JSON.stringify(final)).toContain('"two"')
})
it('uses bounded summary requests on the same model and refuses indivisible oversized tool results',async()=>{
  const chat=vi.fn(async()=>({contentParts:[{type:'text',text:'A short summary'}]})), assert=vi.fn(async()=>{})
  const model={chat} as unknown as ModelInterface
  const messages:ModelMessage[]=[{role:'user',content:'a '.repeat(1700)},call('lookup'),result('lookup',2000)]
  expect(await summarizeWorkerMessages({messages,budget,targetTokens:300,signal:new AbortController().signal,model,assert})).toBe('A short summary')
  expect(chat).toHaveBeenCalled();for(const [,options] of chat.mock.calls as any[]) expect(options).toMatchObject({tools:{},maxSteps:1})
  chat.mockClear()
  await expect(summarizeWorkerMessages({messages:[call('huge'),result('huge',200000)],budget,targetTokens:300,signal:new AbortController().signal,model,assert})).rejects.toThrow('too large');expect(chat).not.toHaveBeenCalled()
})
it('copies context/search parameters to children without copying root authority',()=>{
  expect(workerSessionParameters({contextTokenLimit:150000,autoCompaction:false,subscriptionWebSearch:true,multiAgent:{enabled:true,allowOnDemand:true,dedicatedIds:[],nestedDedicatedIds:[],concurrency:3},agentMode:{value:'on',locked:true,lockReason:'message_sent'}})).toMatchObject({contextTokenLimit:150000,autoCompaction:false,subscriptionWebSearch:true})
  expect(workerSessionParameters({multiAgent:{enabled:true,allowOnDemand:true,dedicatedIds:[],nestedDedicatedIds:[],concurrency:3}}).multiAgent).toBeUndefined()
})

import { beforeEach,expect,it,vi } from 'vitest'
const state=vi.hoisted(()=>({global:{} as any,create:vi.fn(),chat:vi.fn()}))
vi.mock('@/adapters',()=>({createModel:state.create}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({getSettings:()=>state.global})}}))
import { createWorkerContext } from './worker-context'
beforeEach(()=>{vi.clearAllMocks();state.global={contextTokenLimit:1024,compactionThreshold:0.75,autoCompaction:true,providers:{custom:{models:[{modelId:'worker',contextWindow:10000}]}}};state.chat.mockResolvedValue({contentParts:[{type:'text',text:'The earlier work and task are summarized here.'}]});state.create.mockResolvedValue({chat:state.chat})})
it('uses the worker override before global, supports native Auto and respects a smaller model',async()=>{
  const messages=[{role:'user' as const,content:'hello '.repeat(1500)}], signal=new AbortController().signal,assert=vi.fn(async()=>{})
  const override=await createWorkerContext({provider:'custom',modelId:'worker',contextTokenLimit:4096,autoCompaction:false},{},signal,assert)
  expect(await override.prepare(messages)).toEqual(messages)
  const inherited=await createWorkerContext({provider:'custom',modelId:'worker',autoCompaction:false},{},signal,assert)
  await expect(inherited.prepare(messages)).rejects.toThrow('exceeds the context budget')
  state.global.contextTokenLimit=undefined
  expect(await (await createWorkerContext({provider:'custom',modelId:'worker',autoCompaction:false},{},signal,assert)).prepare(messages)).toEqual(messages)
  state.global.providers.custom.models[0].contextWindow=512
  await expect((await createWorkerContext({provider:'custom',modelId:'worker',contextTokenLimit:4096,autoCompaction:false},{},signal,assert)).prepare(messages)).rejects.toThrow('exceeds the context budget')
  expect(state.create).not.toHaveBeenCalled()
})
it('summarizes through the worker model without tools or a global naming-model substitution',async()=>{
  state.global.threadNamingModel={provider:'unrelated-cloud',model:'naming'}
  const assert=vi.fn(async()=>{}),signal=new AbortController().signal
  const controller=await createWorkerContext({provider:'custom',modelId:'worker',contextTokenLimit:6000},{},signal,assert)
  const result=await controller.prepare([{role:'system',content:'Worker policy'},{role:'user',content:'hello '.repeat(2200)},{role:'assistant',content:'world '.repeat(1500)},{role:'user',content:'Finish the task'}])
  expect(state.create).toHaveBeenCalledWith(expect.objectContaining({provider:'custom',modelId:'worker'}))
  expect(state.chat).toHaveBeenCalledWith(expect.any(Array),expect.objectContaining({tools:{},maxSteps:1,signal,onRequestResolved:assert}))
  expect(JSON.stringify(result)).toContain('earlier work');expect(assert).toHaveBeenCalled()
})

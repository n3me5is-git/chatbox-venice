import { expect,it,vi } from 'vitest'
import { GenerationRetryGate } from './generation-retry'
it('asks once after failure, respects skip and permits a fresh decision after a new user message',async()=>{
  const gate=new GenerationRetryGate(),failure={id:'failed-job',kind:'image',model:'model',error:'HTTP 400'},confirm=vi.fn(async()=>false)
  expect(await gate.allow('chat:user-1',failure,confirm)).toBe(false)
  expect(await gate.allow('chat:user-1',failure,confirm)).toBe(false);expect(confirm).toHaveBeenCalledTimes(1)
  confirm.mockResolvedValueOnce(true);expect(await gate.allow('chat:user-2',failure,confirm)).toBe(true)
  expect(await gate.allow('chat:user-2',failure,confirm)).toBe(false);expect(confirm).toHaveBeenCalledTimes(2)
})
it('allows only one caller to consume an approved retry under concurrency',async()=>{
  const gate=new GenerationRetryGate(),confirm=vi.fn(async()=>true),failure={id:'failed',kind:'music',model:'model',error:'Unsupported options'}
  expect(await Promise.all([gate.allow('chat:turn',failure,confirm),gate.allow('chat:turn',failure,confirm)])).toEqual([true,false])
  expect(confirm).toHaveBeenCalledTimes(1)
})

import { expect, it, vi } from 'vitest'
import { createMessage } from './types'
import { latestAgentOutput, latestSnapshotWriter } from './agent-output'
import { agentMetrics } from './agent-metrics'

it('returns the latest final answer, not old tasks or pre-tool promises', () => {
  const old = createMessage('assistant', 'OLD findings')
  const current = createMessage('assistant', '')
  current.contentParts = [{type:'text',text:'I will search'}, {type:'tool-call',toolCallId:'search',toolName:'web_search',state:'result',args:{},result:{}}, {type:'text',text:'Today: verified news and sources'}]
  expect(latestAgentOutput([old,current])).toBe('Today: verified news and sources')
  current.contentParts.pop()
  expect(latestAgentOutput([old,current])).toBe('')
})
it('coalesces slow encrypted writes without losing the newest snapshot or hiding failures', async () => {
  let release!: () => void
  const write = vi.fn(async (value: number) => { if(value===1) await new Promise<void>(resolve=>release=resolve) })
  const writer=latestSnapshotWriter(write)
  writer.push(1);writer.push(2);writer.push(3)
  expect(write.mock.calls.map(call=>call[0])).toEqual([1])
  release();await writer.flush()
  expect(write.mock.calls.map(call=>call[0])).toEqual([1,3])
  writer.push(4);await writer.flush();expect(write.mock.calls.at(-1)).toEqual([4])
  const failed=latestSnapshotWriter(async()=>{throw Error('Storage unavailable')})
  failed.push(1);await expect(failed.flush()).rejects.toThrow('Storage unavailable')
})
it('excludes tool waits and queue time from decoding speed and refuses buffered fake rates', () => {
  let time=0
  const metrics=agentMetrics(15000,()=>time)
  metrics.request();time=500;metrics.delta([{type:'text',text:'Start'}])
  time=2500;metrics.delta([{type:'text',text:'Start finished'}, {type:'tool-call',toolCallId:'call',toolName:'search',state:'call',args:{}}])
  time=62500;metrics.step({outputTokens:100})
  expect(metrics.result()).toMatchObject({queueMs:15000,firstTokenMs:500,generationMs:2000,toolMs:60000,tokensPerSecond:50})
  const buffered=agentMetrics(0,()=>time)
  buffered.request();time+=3000;buffered.delta([{type:'text',text:'All decrypted at once'}]);buffered.step({outputTokens:100})
  expect(buffered.result().tokensPerSecond).toBeUndefined()
})

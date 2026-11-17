import {expect,it} from 'vitest'
import {KnowledgeQueue,forEachKnowledge,withKnowledgeQueue,runKnowledgeRequest,KnowledgeSourceBudget} from './knowledge-queue'
it('shares a strict request cap across concurrent file/page producers',async()=>{let active=0,peak=0;await withKnowledgeQueue(new AbortController().signal,2,async signal=>{await forEachKnowledge([1,2,3,4],4,signal,async()=>{await runKnowledgeRequest(signal,async()=>{peak=Math.max(peak,++active);await new Promise(resolve=>setTimeout(resolve,5));active--})})});expect(peak).toBe(2);expect(active).toBe(0)})
it('removes queued calls on abort without dispatching them',async()=>{const controller=new AbortController(),queue=new KnowledgeQueue(1,controller.signal);let release!:()=>void,dispatched=false;const first=queue.run(()=>new Promise<void>(resolve=>{release=resolve}));await Promise.resolve();const next=queue.run(async()=>{dispatched=true});const rejection=expect(next).rejects.toBeDefined();controller.abort();release();await first;await rejection;expect(dispatched).toBe(false)})
it('drains active workers before reporting failure and stops producing new items',async()=>{let finished=false;await expect(forEachKnowledge([1,2,3],2,new AbortController().signal,async n=>{if(n===1){await new Promise(resolve=>setTimeout(resolve,2));throw Error('broken')}await new Promise(resolve=>setTimeout(resolve,10));finished=true})).rejects.toThrow('broken');expect(finished).toBe(true)})
it('does not read two large sources beyond the configured memory budget',async()=>{const budget=new KnowledgeSourceBudget(10);let active=0,peak=0;await Promise.all([1,2].map(()=>budget.run(8,new AbortController().signal,async()=>{peak=Math.max(peak,++active);await new Promise(resolve=>setTimeout(resolve,4));active--})));expect(peak).toBe(1)})
it('stops queued requests after rate limiting without retrying a paid call',async()=>{
 const queue=new KnowledgeQueue(1,new AbortController().signal);let reject!:(error:unknown)=>void,dispatched=0
 const first=queue.run(()=>{dispatched++;return new Promise<void>((_,fail)=>{reject=fail})});await Promise.resolve()
 const queued=queue.run(async()=>{dispatched++}),error=Object.assign(Error('rate limited'),{status:429})
 const results=Promise.allSettled([first,queued]);reject(error);expect((await results).map(row=>row.status)).toEqual(['rejected','rejected'])
 await expect(queue.run(async()=>{dispatched++})).rejects.toThrow('rate limited');expect(dispatched).toBe(1)
})

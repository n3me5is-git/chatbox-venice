import {describe,it,expect,vi} from 'vitest'
import {SharedHitlQueue,validHitlAnswer,collaborationRequester,type HitlPolicy} from './collaboration'
import {createMessage} from './types'
const input={kind:'questions' as const,input:{questions:[{question:'Choose',options:['A','B'],multiple:true}]}}
const reply={answers:[{selected:['A','B'],text:'Details'}]}
describe('collaborative HITL authority',()=>{
  it.each(['owner','first','requester'] as HitlPolicy[])('enforces %s, validates answers and accepts only one response',async policy=>{
    const queue=new SharedHitlQueue(()=>policy,()=>new Set(['alice','bob']),()=>{}),promise=queue.ask('alice',input)
    const id=queue.requests(policy==='owner'?'owner':'alice')[0].id
    expect(queue.accept(id,'intruder',reply)).toBe(false)
    expect(queue.accept(id,policy==='owner'?'owner':'alice',{answers:[{selected:['invented'],text:''}]})).toBe(false)
    if(policy==='owner')expect(queue.accept(id,'alice',reply)).toBe(false)
    if(policy==='requester'){expect(queue.requests('owner')).toEqual([]);expect(queue.accept(id,'owner',reply)).toBe(false);expect(queue.accept(id,'bob',reply)).toBe(false)}
    expect(queue.accept(id,policy==='owner'?'owner':policy==='first'?'bob':'alice',reply)).toBe(true)
    expect(queue.accept(id,'owner',reply)).toBe(false);expect(queue.requests('alice')).toEqual([]);expect(await promise).toEqual(reply)
  })
  it('cancels on abort, requester revocation, room stop and timeout',async()=>{
    vi.useFakeTimers();try{const queue=new SharedHitlQueue(()=> 'first',()=>new Set(['alice']),()=>{})
      const abort=new AbortController(),first=queue.ask('alice',input,abort.signal);abort.abort();expect(await first).toBeNull()
      const second=queue.ask('alice',input);queue.revoke('alice');expect(await second).toBeNull()
      const third=queue.ask('owner',input);queue.cancel();expect(await third).toBeNull()
      const fourth=queue.ask('owner',input);await vi.advanceTimersByTimeAsync(600001);expect(await fourth).toBeNull()
    }finally{vi.useRealTimers()}
  })
  it('rejects an approval answer to a question and vice versa',()=>{
    expect(validHitlAnswer(input,true)).toBe(false);expect(validHitlAnswer({kind:'confirm',title:'Pay?',detail:'Cost'},reply)).toBe(false)
    expect(validHitlAnswer(input,{answers:[{selected:[],text:'Custom answer'}]})).toBe(true)
    expect(validHitlAnswer(input,{answers:[]})).toBe(false)
  })
  it('requires owner-side references for edits and checks remote aspect ratios against the catalog',async()=>{
    const queue=new SharedHitlQueue(()=> 'first',()=>new Set(['alice']),()=>{}),input={kind:'image' as const,prompt:'Edit',count:1,models:[{id:'edit',name:'Editor',requiresReferences:true},{id:'new',name:'Generator',ratios:['1:1','21:9']}]}
    const pending=queue.ask('alice',input),id=queue.requests('owner')[0].id
    expect(queue.accept(id,'alice',{modelId:'edit',prompt:'Edit',count:1,aspectRatio:'auto'})).toBe(false)
    expect(queue.accept(id,'alice',{modelId:'new',prompt:'New',count:1,aspectRatio:'9:16'})).toBe(false)
    expect(queue.accept(id,'alice',{modelId:'new',prompt:'New',count:1,aspectRatio:'21:9'})).toBe(true);expect(await pending).toMatchObject({aspectRatio:'21:9'})
    const owner=queue.ask('owner',input),ownerId=queue.requests('owner')[0].id;expect(queue.accept(ownerId,'owner',{modelId:'edit',prompt:'Edit',count:1,aspectRatio:'auto'})).toBe(true);await owner
  })
  it('keeps the original requester through a background follow-up',()=>{
    const first={...createMessage('user','Alice'),collaborationAuthor:{id:'alice',name:'Alice'}},second={...createMessage('user','Bob'),collaborationAuthor:{id:'bob',name:'Bob'}}
    const followup={...createMessage('user','Completion'),collaborationRequester:first.collaborationAuthor}
    expect(collaborationRequester([first,second,followup])).toEqual(first.collaborationAuthor)
    expect(collaborationRequester([first,createMessage('user','Owner request')]).id).toBe('owner')
  })
})

import {expect,it,vi} from 'vitest'
import {KnowledgeVerificationSettingsSchema,validateKnowledgeJudgment,verifyKnowledgeAnswer,type KnowledgeCheckSource} from './knowledge-verification'
const source={id:'policy',origin:'knowledge' as const,name:'Policy',url:'https://chatbox.invalid/source',content:'The current retention period is 30 days.'},settings=KnowledgeVerificationSettingsSchema.parse({enabled:true,consented:true,model:{provider:'private',model:'judge'}})
const claim=(text:string,verdict:string,quote=source.content)=>({claims:[{start:0,end:text.length,text,verdict,reason:'Source comparison',evidence:[{id:'policy',quote,stance:verdict==='contradicted'?'contradicts':'supports'}]}]})
it('does not accept forged IDs, invented source quotes or incorrect answer offsets as verified support',()=>{
 const answer='Retention is 30 days.';expect(validateKnowledgeJudgment(answer,[source],claim(answer,'supported','invented')).claims[0].verdict).toBe('insufficient');const fake=claim(answer,'supported');fake.claims[0].evidence[0].id='other';expect(validateKnowledgeJudgment(answer,[source],fake).claims[0].verdict).toBe('insufficient');const span=claim(answer,'supported');span.claims[0].end--;expect(validateKnowledgeJudgment(answer,[source],span).claims[0].end).toBe(answer.length);span.claims[0].text='Invented answer';expect(()=>validateKnowledgeJudgment(answer,[source],span)).toThrow('span')
})
it('corrects a conflicting draft once and verifies the actual revised answer, with no open-ended agent loop',async()=>{
 const draft='Retention is 90 days.',final='Retention is 30 days.',judge=vi.fn(async (text:string)=>claim(text,text===draft?'contradicted':'supported')),revise=vi.fn(async()=>({answer:final})),result=await verifyKnowledgeAnswer(draft,[source],settings,{check:async()=>{},judge,revise},new AbortController().signal)
 expect(result.answer).toBe(final);expect(result.report).toMatchObject({status:'checked',revised:true,calls:3,coverage:1});expect(judge.mock.calls.map(call=>call[0])).toEqual([draft,final]);expect(revise).toHaveBeenCalledOnce();expect(result.report.answerHash).not.toBe(result.report.draftHash)
})
it('leaves unresolved conflicts explicitly incomplete after the bounded final check',async()=>{
 const judge=vi.fn(async (text:string)=>claim(text,'contradicted')),revise=vi.fn(async()=>({answer:'Retention is 180 days.'})),result=await verifyKnowledgeAnswer('Retention is 90 days.',[source],settings,{check:async()=>{},judge,revise},new AbortController().signal)
 expect(result.report).toMatchObject({status:'incomplete',reason:'conflict',calls:3});expect(judge).toHaveBeenCalledTimes(2);expect(revise).toHaveBeenCalledOnce()
})
it('never publishes decrypted results after access is revoked, even if the verifier returns late',async()=>{
 let locked=false;const check=async()=>{if(locked)throw Error('Access revoked')},judge=async (text:string)=>{locked=true;return claim(text,'supported')};await expect(verifyKnowledgeAnswer('Retention is 30 days.',[source],settings,{check,judge,revise:vi.fn()},new AbortController().signal)).rejects.toThrow('revoked')
})
it('avoids model charges when there are no sources, consent is missing, or the bounded input is exceeded',async()=>{
 const port={check:async()=>{},judge:vi.fn(),revise:vi.fn()};for(const [text,sources,cfg]of [['Answer',[],settings],['Answer',[source],{...settings,consented:false}],['x'.repeat(24001),[source],settings]] as const){const result=await verifyKnowledgeAnswer(text,sources,cfg,port,new AbortController().signal);expect(result.report.status).toBe('unverified')}expect(port.judge).not.toHaveBeenCalled()
})

const evidenceFor = (id:string,content:string) => ({...source,id,content,url:'https://chatbox.invalid/'+id})
const unresolved = (text:string,query:string) => ({
 claims:[{text,verdict:'insufficient',reason:'Missing policy detail',evidence:[]}],
 followUp:{start:0,query},
})

it.each([0,1,2] as const)('enforces a budget of %d local follow-up searches',async limit=>{
 const draft='Retention is 90 days.'
 let judgmentNumber=0,excerptNumber=0
 const judge=vi.fn(async()=>unresolved(draft,'retention version '+(++judgmentNumber)))
 const retrieve=vi.fn(async()=>[evidenceFor('fresh-'+(++excerptNumber),'Retention documentation includes separate schedules.')])
 const revise=vi.fn()
 const result=await verifyKnowledgeAnswer(draft,[source],{...settings,followUpSearches:limit},{check:async()=>{},judge,revise,retrieve},new AbortController().signal)
 expect(retrieve).toHaveBeenCalledTimes(limit)
 expect(result.report.calls).toBe(limit+1)
 expect(result.report.status).toBe('incomplete')
 expect(result.report.followUp?.evidenceAdded??0).toBe(limit)
 expect(revise).not.toHaveBeenCalled()
})

it('rejudges fresh passages before deciding to correct, then verifies the actual revised answer',async()=>{
 const draft='Retention is 90 days.',final='Retention is 30 days.'
 const extra=evidenceFor('revision','The updated policy requires retention of 30 days.')
 const judge=vi.fn(async(text:string,sources:readonly KnowledgeCheckSource[])=>{
  if(sources.length===1)return unresolved(draft,'current retention policy')
  return {claims:[{text,verdict:text===draft?'contradicted':'supported',reason:'Updated policy',evidence:[{id:extra.id,quote:extra.content,stance:text===draft?'contradicts':'supports'}]}]}
 })
 const retrieve=vi.fn(async()=>[extra])
 const revise=vi.fn(async()=>({answer:final}))
 const result=await verifyKnowledgeAnswer(draft,[source],{...settings,followUpSearches:2},{check:async()=>{},judge,revise,retrieve},new AbortController().signal)
 expect(judge.mock.calls.map(([text])=>text)).toEqual([draft,draft,final])
 expect(revise).toHaveBeenCalledWith(draft,expect.anything(),[source,extra],expect.any(AbortSignal))
 expect(retrieve).toHaveBeenCalledOnce()
 expect(result.answer).toBe(final)
 expect(result.report).toMatchObject({status:'checked',revised:true,calls:4,followUp:{searches:1,evidenceAdded:1}})
})

it('caps extra excerpts at three per round and the complete correction workflow at five model calls',async()=>{
 const draft='Retention is 90 days.',final='Retention is 30 days.'
 const judge=vi.fn(async(text:string,sources:readonly KnowledgeCheckSource[])=>{
  if(sources.length<7)return unresolved(draft,'retention revision '+sources.length)
  const policy=sources.at(-1)!
  return {claims:[{text,verdict:text===draft?'contradicted':'supported',reason:'Updated policy',evidence:[{
   id:policy.id,quote:policy.content,stance:text===draft?'contradicts':'supports',
  }]}]}
 })
 let round=0
 const retrieve=vi.fn(async()=>{
  const currentRound=++round
  return Array.from({length:5},(_,i)=>evidenceFor('round-'+currentRound+'-'+i,'Current policy states 30 days.'))
 })
 const revise=vi.fn(async()=>({answer:final}))
 const result=await verifyKnowledgeAnswer(draft,[source],{...settings,followUpSearches:2},{check:async()=>{},judge,revise,retrieve},new AbortController().signal)
 expect(result.answer).toBe(final)
 expect(result.report).toMatchObject({status:'checked',calls:5,followUp:{searches:2,evidenceAdded:6}})
 expect(result.report.sources).toHaveLength(7)
 expect(judge.mock.calls.map(([,sources])=>sources.length)).toEqual([1,4,7,7])
 expect(revise).toHaveBeenCalledOnce()
})

it('stops on duplicate evidence, repeated queries and supported statements',async()=>{
 const draft='Retention is 30 days.'
 const supported=vi.fn(async()=>({...claim(draft,'supported'),followUp:{start:0,query:'retention period'}}))
 const retrieve=vi.fn(async()=>[source])
 const config={...settings,followUpSearches:2 as const}
 const port={check:async()=>{},judge:supported,revise:vi.fn(),retrieve}
 await verifyKnowledgeAnswer(draft,[source],config,port,new AbortController().signal)
 expect(retrieve).not.toHaveBeenCalled()
 const judge=vi.fn(async()=>unresolved(draft,'retention period'))
 const duplicate=await verifyKnowledgeAnswer(draft,[source],config,{...port,judge},new AbortController().signal)
 expect(duplicate.report).toMatchObject({calls:1,followUp:{searches:1,evidenceAdded:0}})
 retrieve.mockResolvedValueOnce([evidenceFor('other','Retention policy applies to multiple products.')])
 retrieve.mockClear()
 const repeated=await verifyKnowledgeAnswer(draft,[source],config,{...port,judge},new AbortController().signal)
 expect(repeated.report).toMatchObject({calls:2,followUp:{searches:1,evidenceAdded:1}})
 expect(retrieve).toHaveBeenCalledOnce()
})

it('keeps the validated report when a follow-up judge fails and refuses revoked scope',async()=>{
 const draft='Retention is 90 days.'
 const config={...settings,followUpSearches:2 as const}
 let revoked=false
 const check=async()=>{if(revoked)throw Error('Access revoked')}
 const judge=vi.fn().mockResolvedValueOnce(unresolved(draft,'retention version')).mockRejectedValueOnce(Error('Temporary failure'))
 const retrieve=vi.fn(async()=>[evidenceFor('extra','Confirmed retention period is 30 days.')])
 const port={check,judge,revise:vi.fn(),retrieve}
 const result=await verifyKnowledgeAnswer(draft,[source],config,port,new AbortController().signal)
 expect(result.report).toMatchObject({status:'incomplete',calls:2,followUp:{searches:1,evidenceAdded:0,interrupted:true},sources:[{id:source.id}]})
 judge.mockResolvedValueOnce(unresolved(draft,'retention version'))
 retrieve.mockImplementationOnce(async()=>{revoked=true;return [evidenceFor('extra','Scoped document.')]})
 await expect(verifyKnowledgeAnswer(draft,[source],config,port,new AbortController().signal)).rejects.toThrow('revoked')
})

import {expect,it,vi} from 'vitest'
import {KnowledgeVerificationSettingsSchema,validateKnowledgeJudgment,verifyKnowledgeAnswer} from './knowledge-verification'
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

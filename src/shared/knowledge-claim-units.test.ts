import {expect,it} from 'vitest'
import {knowledgeClaimUnits,knowledgeJudgePayload,resolveKnowledgeClaimUnits} from './knowledge-claim-units'
import {validateKnowledgeJudgment,type KnowledgeCheckSource} from './knowledge-verification'
import {knowledgeCoverage} from './knowledge-coverage'
const sources:KnowledgeCheckSource[]=[{id:'receipt',origin:'knowledge',name:'Project',url:'https://example.test/project',content:'Aurora has client Acme. Delivery is in December.'}]
it('anchors Markdown and Unicode on the client without asking a model to copy text',()=>{const text='## Progetto\n\n**Aurora** has client Acme. Delivery is in December. [Source](https://example.test/project)',units=knowledgeClaimUnits(text,sources);expect(units.length).toBeGreaterThan(2);for(const unit of units)expect(text.slice(unit.start,unit.end)).toBe(unit.text);expect(knowledgeJudgePayload(text,sources).sources[0].id).toBe('S1')})
it('does not let missing judgments become supported, and preserves exact source receipts',()=>{const text='Aurora has client Acme. Delivery is in December.',resolved=resolveKnowledgeClaimUnits(text,sources,{claims:[{id:'C1',verdict:'supported',reason:'Explicit',evidence:[{id:'S1',quote:'Aurora has client Acme.',stance:'supports'}]}]}),checked=validateKnowledgeJudgment(text,sources,resolved);expect(checked.claims.map(claim=>claim.verdict)).toEqual(['supported','insufficient']);expect(checked.claims[0].evidence[0].id).toBe('receipt')})
it('rejects repeated and fabricated statement identities',()=>{const row={id:'C1',verdict:'insufficient',reason:'None',evidence:[]};expect(()=>resolveKnowledgeClaimUnits('One.',sources,{claims:[row,row]})).toThrow('repeated');expect(()=>resolveKnowledgeClaimUnits('One.',sources,{claims:[{...row,id:'C2'}]})).toThrow('unknown')})
it('does not turn an invented quote into supporting evidence',()=>{const text='Aurora has client Acme.',value=resolveKnowledgeClaimUnits(text,sources,{claims:[{id:'C1',verdict:'supported',reason:'Match',evidence:[{id:'S1',quote:'Invented fact',stance:'supports'}]}]});expect(validateKnowledgeJudgment(text,sources,value).claims[0].verdict).toBe('insufficient')})
it('bounds request size while retaining coverage of the last statement',()=>{const text=Array.from({length:100},(_,i)=>'Statement '+i+'.').join('\n\n'),units=knowledgeClaimUnits(text,sources);expect(units.length).toBeLessThanOrEqual(32);expect(units.at(-1)?.text).toContain('Statement 99')})
it('keeps tables, displayed formulas, code and image descriptions in the review scope',()=>{const text='| Project | Client |\n| --- | --- |\n| Aurora | Acme |\n\n$$\nx = 2\n$$\n\n```js\nconst total = 10\n```\n\n![Figure shows 30 days](https://example.test/image.png)',units=knowledgeClaimUnits(text,sources);expect(knowledgeCoverage(text,sources,units)).toBe(1);expect(units.some(unit=>unit.text==='Acme')).toBe(true);expect(units.some(unit=>unit.text.includes('x = 2'))).toBe(true)})
it('binds an optional lookup to an exact claim and keeps valid judgments when a proposal is malformed',()=>{
 const text='Aurora has client Acme. Delivery date is uncertain.'
 const raw={claims:[{id:'C1',verdict:'supported',reason:'Explicit',evidence:[{id:'S1',quote:'Aurora has client Acme.',stance:'supports'}]}],followUp:{id:'C2',query:'Aurora delivery schedule'}}
 expect(resolveKnowledgeClaimUnits(text,sources,raw,true).followUp).toEqual({start:text.indexOf('Delivery'),query:raw.followUp.query})
 expect(resolveKnowledgeClaimUnits(text,sources,raw).followUp).toBeUndefined()
 for(const followUp of [{...raw.followUp,id:'C9'},{...raw.followUp,query:'line one\nline two'}]){
  const resolved=resolveKnowledgeClaimUnits(text,sources,{...raw,followUp},true)
  expect(resolved.followUp).toBeUndefined()
  expect(resolved.claims[0].verdict).toBe('supported')
 }
})
